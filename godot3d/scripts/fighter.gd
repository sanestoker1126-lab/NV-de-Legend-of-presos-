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
var is_guarding: bool = false
var is_defeated: bool = false
var _visual: MeshInstance3D
var _guard_visual: MeshInstance3D

func _ready() -> void:
	health = max_health
	power = 0.0
	_build_visuals()
	add_to_group("fighters")

func _build_visuals() -> void:
	var collision := CollisionShape3D.new()
	var collision_shape := CapsuleShape3D.new()
	collision_shape.radius = 0.42
	collision_shape.height = 1.9
	collision.shape = collision_shape
	collision.position.y = 0.95
	add_child(collision)

	var capsule := CapsuleMesh.new()
	capsule.radius = 0.42
	capsule.height = 1.9
	_visual = MeshInstance3D.new()
	_visual.name = "PlaceholderBody"
	_visual.mesh = capsule
	var material := StandardMaterial3D.new()
	material.albedo_color = body_color
	material.roughness = 0.72
	_visual.material_override = material
	_visual.position.y = 0.95
	add_child(_visual)

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

func tick_timers(delta: float) -> void:
	attack_cooldown = maxf(0.0, attack_cooldown - delta)
	hit_stun = maxf(0.0, hit_stun - delta)
	if not is_on_floor():
		velocity.y -= 22.0 * delta
	else:
		velocity.y = minf(velocity.y, 0.0)
	is_guarding = false
	_guard_visual.visible = false

func face_target(target: Vector3) -> void:
	var direction := target.x - global_position.x
	if absf(direction) > 0.03:
		facing = signf(direction)
		rotation.y = 0.0 if facing > 0.0 else PI

func move_horizontal(axis: float, delta: float) -> void:
	if is_defeated or hit_stun > 0.0:
		axis = 0.0
	velocity.x = axis * move_speed
	velocity.z = 0.0
	move_and_slide()
	global_position.x = clampf(global_position.x, -8.0, 8.0)

func jump() -> void:
	if is_on_floor() and not is_defeated and hit_stun <= 0.0:
		velocity.y = 8.0

func begin_attack(cooldown: float) -> bool:
	if is_defeated or hit_stun > 0.0 or attack_cooldown > 0.0:
		return false
	attack_cooldown = cooldown
	return true

func set_guarding(active: bool) -> void:
	is_guarding = active and not is_defeated and hit_stun <= 0.0
	_guard_visual.visible = is_guarding

func receive_hit(damage: float, knockback: float, attacker_x: float) -> void:
	if is_defeated:
		return
	var applied_damage := damage * (0.2 if is_guarding and signf(attacker_x - global_position.x) == facing else 1.0)
	health = maxf(0.0, health - applied_damage)
	hit_stun = 0.24
	velocity.x = signf(global_position.x - attacker_x) * knockback
	power = minf(max_power, power + 8.0)
	health_changed.emit(self)
	if health <= 0.0:
		is_defeated = true
		velocity = Vector3.ZERO
		fighter_defeated.emit(self)
