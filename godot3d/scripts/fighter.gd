extends CharacterBody3D
class_name PGFighter

signal health_changed(fighter: PGFighter)
signal fighter_defeated(fighter: PGFighter)

@export var fighter_name: String = "TOBI"
@export var body_color: Color = Color(0.75, 0.12, 0.22)
@export var move_speed: float = 5.0
@export var max_health: float = 100.0
@export var max_power: float = 100.0

var health: float = 100.0
var power: float = 0.0
var facing: float = 1.0
var attack_cooldown: float = 0.0
var hit_stun: float = 0.0
var last_reaction: String = ""
var is_guarding: bool = false
var is_defeated: bool = false
var _sprite: Sprite3D
var _guard_visual: MeshInstance3D
var _atlas: Texture2D
var _frame_size := Vector2i(120, 120)
var _atlas_columns := 9
var _animations: Dictionary = {}
var _animation_name := "idle"
var _animation_clock := 0.0
var _action_override := ""
var _action_time := 0.0

func _ready() -> void:
	health = max_health
	power = 0.0
	_build_visuals()
	add_to_group("fighters")

func configure_atlas(texture: Texture2D, frame_size: Vector2i, columns: int, animations: Dictionary) -> void:
	_atlas = texture
	_frame_size = frame_size
	_atlas_columns = maxi(1, columns)
	_animations = animations.duplicate(true)
	if is_inside_tree():
		_apply_atlas()
	_update_sprite_animation(0.0)

func _build_visuals() -> void:
	var collision := CollisionShape3D.new()
	var collision_shape := CapsuleShape3D.new()
	collision_shape.radius = 0.42
	collision_shape.height = 1.9
	collision.shape = collision_shape
	collision.position.y = 0.95
	add_child(collision)

	_sprite = Sprite3D.new()
	_sprite.name = "CharacterAtlasSprite"
	_sprite.centered = false
	_sprite.billboard = BaseMaterial3D.BILLBOARD_FIXED_Y
	_sprite.position.y = 0.02
	_sprite.pixel_size = 1.65 / float(maxi(1, _frame_size.y))
	_sprite.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	_sprite.texture = _atlas
	_apply_atlas()
	add_child(_sprite)

	var guard_mesh := SphereMesh.new()
	guard_mesh.radius = 0.75
	guard_mesh.height = 1.5
	_guard_visual = MeshInstance3D.new()
	_guard_visual.name = "GuardIndicator"
	_guard_visual.mesh = guard_mesh
	var guard_material := StandardMaterial3D.new()
	guard_material.albedo_color = Color(0.15, 0.65, 1.0, 0.28)
	guard_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	guard_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_guard_visual.material_override = guard_material
	_guard_visual.position.y = 0.95
	_guard_visual.visible = false
	add_child(_guard_visual)

func _apply_atlas() -> void:
	if not is_instance_valid(_sprite):
		return
	_sprite.texture = _atlas
	_sprite.region_enabled = _atlas != null
	_sprite.region_rect = Rect2(Vector2.ZERO, Vector2(_frame_size))
	_sprite.offset = Vector2(-float(_frame_size.x) * 0.5, -float(_frame_size.y))
	_sprite.pixel_size = 1.65 / float(maxi(1, _frame_size.y))

func tick_timers(delta: float) -> void:
	attack_cooldown = maxf(0.0, attack_cooldown - delta)
	hit_stun = maxf(0.0, hit_stun - delta)
	_action_time = maxf(0.0, _action_time - delta)
	_animation_clock += delta
	if not is_on_floor():
		velocity.y -= 22.0 * delta
	else:
		velocity.y = minf(velocity.y, 0.0)
	is_guarding = false
	_guard_visual.visible = false
	_update_sprite_animation(delta)

func face_target(target: Vector3) -> void:
	var direction := target.x - global_position.x
	if absf(direction) > 0.03:
		facing = signf(direction)
		if is_instance_valid(_sprite):
			_sprite.flip_h = facing < 0.0

func move_horizontal(axis: float, delta: float) -> void:
	if is_defeated:
		velocity = Vector3.ZERO
		return
	if hit_stun > 0.0:
		velocity.x = move_toward(velocity.x, 0.0, 14.0 * delta)
	else:
		velocity.x = axis * move_speed
	velocity.z = 0.0
	move_and_slide()
	global_position.x = clampf(global_position.x, -8.0, 8.0)

func jump() -> void:
	if is_on_floor() and not is_defeated and hit_stun <= 0.0:
		velocity.y = 5.6
		play_action("jump", 0.28)

func begin_attack(cooldown: float) -> bool:
	if is_defeated or hit_stun > 0.0 or attack_cooldown > 0.0:
		return false
	attack_cooldown = cooldown
	return true

func play_action(action: String, duration: float = 0.22) -> void:
	_action_override = action
	_action_time = duration
	_update_sprite_animation(0.0)

func set_guarding(active: bool) -> void:
	is_guarding = active and not is_defeated and hit_stun <= 0.0
	_guard_visual.visible = is_guarding

func receive_hit(damage: float, knockback: float, attacker_x: float, hit_kind: String = "punch") -> void:
	if is_defeated:
		return
	var blocked := is_guarding and signf(attacker_x - global_position.x) == facing
	var applied_damage := damage * (0.18 if blocked else 1.0)
	health = maxf(0.0, health - applied_damage)
	hit_stun = 0.18 if blocked else (0.30 if hit_kind == "punch" else (0.38 if hit_kind == "kick" else 0.48))
	last_reaction = "guard" if blocked else hit_kind
	_action_override = "guard" if blocked and _animations.has("guard") else ("hurt" if _animations.has("hurt") else "idle")
	_action_time = hit_stun
	var push_direction := signf(global_position.x - attacker_x)
	velocity.x = push_direction * (knockback * (0.28 if blocked else 1.0))
	if not blocked and hit_kind == "kick" and is_on_floor():
		velocity.y = minf(velocity.y, 0.9)
	power = minf(max_power, power + (4.0 if blocked else 8.0))
	health_changed.emit(self)
	_update_sprite_animation(0.0)
	if health <= 0.0:
		is_defeated = true
		velocity = Vector3.ZERO
		fighter_defeated.emit(self)

func _update_sprite_animation(_delta: float) -> void:
	if not is_instance_valid(_sprite) or _atlas == null or _animations.is_empty():
		return
	var desired := "idle"
	if hit_stun > 0.0:
		if _animations.has(_action_override):
			desired = _action_override
		elif _animations.has("hurt"):
			desired = "hurt"
	elif _action_time > 0.0 and not _action_override.is_empty():
		desired = _action_override
	elif absf(velocity.x) > 0.25 and _animations.has("walk"):
		desired = "walk"
	if not _animations.has(desired):
		desired = "punch" if desired == "special" and _animations.has("punch") else "idle"
	if not _animations.has(desired):
		return
	var animation: Dictionary = _animations[desired]
	# Restart a newly selected action at frame zero instead of sampling the global animation clock.
	if _animation_name != desired:
		_animation_name = desired
		_animation_clock = 0.0
	var frames := maxi(1, int(animation.get("frames", 1)))
	var start_column := int(animation.get("start", 0))
	var row := int(animation.get("row", 0))
	var frame_duration := 0.14 if desired == "idle" else (0.095 if desired == "walk" else 0.085)
	var frame := int(floor(_animation_clock / frame_duration)) % frames
	var texture_columns := maxi(1, int(floor(float(_atlas.get_width()) / float(_frame_size.x))))
	var texture_rows := maxi(1, int(floor(float(_atlas.get_height()) / float(_frame_size.y))))
	var safe_row := clampi(row, 0, texture_rows - 1)
	var safe_start := clampi(start_column, 0, texture_columns - 1)
	var safe_frames := maxi(1, mini(frames, texture_columns - safe_start))
	var safe_frame := mini(frame, safe_frames - 1)
	var column := safe_start + safe_frame
	var rect := Rect2(Vector2(column * _frame_size.x, safe_row * _frame_size.y), Vector2(_frame_size))
	if _sprite.region_rect != rect:
		_sprite.region_rect = rect
