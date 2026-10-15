extends Node3D

const FighterScript = preload("res://scripts/fighter.gd")
const FIXED_STEP := 1.0 / 60.0
const MAX_DURATION := 10.0

var player: PGFighter
var opponent: PGFighter
var player_hp: ProgressBar
var opponent_hp: ProgressBar
var power_bar: ProgressBar
var status_label: Label
var timer_label: Label
var round_time := 99.0
var max_time := 0.0
var max_active := false
var match_running := true
var ai_clock := 0.0
var touch_input: Dictionary = {"left": false, "right": false, "guard": false}

func _ready() -> void:
	_build_arena()
	_build_fighters()
	_build_camera_and_lights()
	_build_hud()
	_set_status("PUENTE GRANDE · COMBATE 3D")
	set_physics_process(true)

func _physics_process(delta: float) -> void:
	if not match_running:
		return
	round_time = maxf(0.0, round_time - delta)
	if round_time <= 0.0:
		match_running = false
		_set_status("TIEMPO TERMINADO")
		return
	if max_active:
		max_time = maxf(0.0, max_time - delta)
		if max_time <= 0.0:
			max_active = false
			_set_status("MAX TERMINADO")

	player.tick_timers(delta)
	opponent.tick_timers(delta)
	player.face_target(opponent.global_position)
	opponent.face_target(player.global_position)

	var move_axis := Input.get_axis("ui_left", "ui_right")
	if Input.is_key_pressed(KEY_A):
		move_axis = -1.0
	if Input.is_key_pressed(KEY_D):
		move_axis = 1.0
	if touch_input.left:
		move_axis = -1.0
	if touch_input.right:
		move_axis = 1.0
	player.move_horizontal(move_axis, delta)
	player.set_guarding(Input.is_key_pressed(KEY_S) or touch_input.guard)

	if Input.is_key_just_pressed(KEY_W) or Input.is_key_just_pressed(KEY_SPACE):
		player.jump()
	if Input.is_key_just_pressed(KEY_J):
		_attack(player, opponent, "PUNCH")
	if Input.is_key_just_pressed(KEY_K):
		_attack(player, opponent, "KICK")
	if Input.is_key_just_pressed(KEY_L):
		_special()
	if Input.is_key_just_pressed(KEY_M):
		_activate_max()

	_update_cpu(delta)
	player.power = minf(100.0, player.power + 2.0 * delta)
	opponent.power = minf(100.0, opponent.power + 1.5 * delta)
	_update_hud()

func _build_arena() -> void:
	var floor_body := StaticBody3D.new()
	floor_body.name = "ArenaFloor"
	var floor_mesh := MeshInstance3D.new()
	var box := BoxMesh.new()
	box.size = Vector3(18.0, 0.4, 7.0)
	floor_mesh.mesh = box
	var floor_material := StandardMaterial3D.new()
	floor_material.albedo_color = Color(0.13, 0.12, 0.15)
	floor_material.roughness = 0.92
	floor_mesh.material_override = floor_material
	floor_body.add_child(floor_mesh)
	var floor_collision := CollisionShape3D.new()
	var floor_shape := BoxShape3D.new()
	floor_shape.size = box.size
	floor_collision.shape = floor_shape
	floor_body.add_child(floor_collision)
	floor_body.position.y = -0.2
	add_child(floor_body)

	for side in [-1.0, 1.0]:
		var rail := MeshInstance3D.new()
		var rail_mesh := BoxMesh.new()
		rail_mesh.size = Vector3(0.15, 2.2, 0.15)
		rail.mesh = rail_mesh
		var rail_material := StandardMaterial3D.new()
		rail_material.albedo_color = Color(0.55, 0.08, 0.12)
		rail.material_override = rail_material
		rail.position = Vector3(side * 8.2, 1.0, -1.2)
		add_child(rail)

	for index in range(9):
		var stripe := MeshInstance3D.new()
		var stripe_mesh := BoxMesh.new()
		stripe_mesh.size = Vector3(0.025, 0.012, 6.7)
		stripe.mesh = stripe_mesh
		var stripe_material := StandardMaterial3D.new()
		stripe_material.albedo_color = Color(0.28, 0.25, 0.29)
		stripe.material_override = stripe_material
		stripe.position = Vector3(-7.5 + float(index) * 1.875, 0.012, 0.0)
		add_child(stripe)

func _build_fighters() -> void:
	player = FighterScript.new()
	player.fighter_name = "TOBI"
	player.body_color = Color(0.78, 0.10, 0.20)
	player.position = Vector3(-3.0, 0.0, 0.0)
	add_child(player)

	opponent = FighterScript.new()
	opponent.fighter_name = "DON GARRAVAS"
	opponent.body_color = Color(0.12, 0.43, 0.64)
	opponent.position = Vector3(3.0, 0.0, 0.0)
	add_child(opponent)

	player.fighter_defeated.connect(_on_fighter_defeated)
	opponent.fighter_defeated.connect(_on_fighter_defeated)

func _build_camera_and_lights() -> void:
	var camera := Camera3D.new()
	camera.position = Vector3(0.0, 5.0, 12.5)
	camera.fov = 48.0
	camera.look_at(Vector3(0.0, 1.0, 0.0), Vector3.UP)
	add_child(camera)
	var key_light := DirectionalLight3D.new()
	key_light.rotation_degrees = Vector3(-48.0, -25.0, 0.0)
	key_light.light_energy = 1.4
	add_child(key_light)
	var fill_light := OmniLight3D.new()
	fill_light.position = Vector3(0.0, 4.0, 2.0)
	fill_light.light_energy = 0.8
	fill_light.omni_range = 14.0
	add_child(fill_light)
	var world := WorldEnvironment.new()
	var environment := Environment.new()
	environment.background_mode = Environment.BG_SKY
	environment.sky = Sky.new()
	var sky_material := ProceduralSkyMaterial.new()
	sky_material.sky_top_color = Color(0.035, 0.02, 0.055)
	sky_material.sky_horizon_color = Color(0.18, 0.06, 0.09)
	environment.sky.sky_material = sky_material
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color(0.55, 0.48, 0.58)
	environment.ambient_light_energy = 0.65
	world.environment = environment
	add_child(world)

func _build_hud() -> void:
	var layer := CanvasLayer.new()
	layer.name = "HUD"
	add_child(layer)
	var root := Control.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	layer.add_child(root)

	var title := Label.new()
	title.text = "PUENTE GRANDE  /  LEGEND OF PRESOS"
	title.position = Vector2(24, 14)
	title.add_theme_font_size_override("font_size", 23)
	title.add_theme_color_override("font_color", Color(1.0, 0.78, 0.78))
	root.add_child(title)

	player_hp = _make_bar(root, Vector2(24, 56), Vector2(440, 24), Color(0.83, 0.12, 0.22))
	opponent_hp = _make_bar(root, Vector2(816, 56), Vector2(440, 24), Color(0.1, 0.48, 0.75))
	power_bar = _make_bar(root, Vector2(24, 88), Vector2(440, 12), Color(1.0, 0.62, 0.14))
	timer_label = Label.new()
	timer_label.position = Vector2(610, 48)
	timer_label.size = Vector2(60, 44)
	timer_label.text = "99"
	timer_label.add_theme_font_size_override("font_size", 30)
	root.add_child(timer_label)
	status_label = Label.new()
	status_label.position = Vector2(390, 116)
	status_label.size = Vector2(500, 36)
	status_label.add_theme_font_size_override("font_size", 18)
	root.add_child(status_label)

	var left_group := HBoxContainer.new()
	left_group.position = Vector2(20, 600)
	left_group.add_theme_constant_override("separation", 8)
	root.add_child(left_group)
	_add_hold_button(left_group, "◀", "left")
	_add_hold_button(left_group, "▶", "right")
	_add_hold_button(left_group, "GUARD", "guard")

	var action_group := HBoxContainer.new()
	action_group.position = Vector2(770, 600)
	action_group.add_theme_constant_override("separation", 8)
	root.add_child(action_group)
	_add_action_button(action_group, "JUMP", Callable(self, "_jump_player"))
	_add_action_button(action_group, "PUNCH", Callable(self, "_punch_player"))
	_add_action_button(action_group, "KICK", Callable(self, "_kick_player"))
	_add_action_button(action_group, "SP", Callable(self, "_special"))
	_add_action_button(action_group, "MAX", Callable(self, "_activate_max"))

func _make_bar(parent: Control, at: Vector2, dimensions: Vector2, fill_color: Color) -> ProgressBar:
	var bar := ProgressBar.new()
	bar.position = at
	bar.size = dimensions
	bar.min_value = 0.0
	bar.max_value = 100.0
	bar.value = 100.0
	bar.show_percentage = false
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.07, 0.06, 0.08)
	bar.add_theme_stylebox_override("background", style)
	var fill := StyleBoxFlat.new()
	fill.bg_color = fill_color
	bar.add_theme_stylebox_override("fill", fill)
	parent.add_child(bar)
	return bar

func _add_hold_button(parent: HBoxContainer, caption: String, action: String) -> void:
	var button := Button.new()
	button.text = caption
	button.custom_minimum_size = Vector2(76, 56)
	button.button_down.connect(func(): touch_input[action] = true)
	button.button_up.connect(func(): touch_input[action] = false)
	parent.add_child(button)

func _add_action_button(parent: HBoxContainer, caption: String, callback: Callable) -> void:
	var button := Button.new()
	button.text = caption
	button.custom_minimum_size = Vector2(76, 56)
	button.pressed.connect(callback)
	parent.add_child(button)

func _attack(attacker: PGFighter, defender: PGFighter, kind: String) -> void:
	var cooldown := 0.34 if kind == "PUNCH" else 0.49
	if not attacker.begin_attack(cooldown):
		return
	var distance := absf(defender.global_position.x - attacker.global_position.x)
	var in_front := signf(defender.global_position.x - attacker.global_position.x) == attacker.facing
	var reach := 1.65 if kind == "PUNCH" else 2.15
	if distance <= reach and in_front and absf(defender.global_position.y - attacker.global_position.y) < 1.1:
		var damage := 9.0 if kind == "PUNCH" else 14.0
		var knockback := 2.0 if kind == "PUNCH" else 3.0
		defender.receive_hit(damage * (1.35 if max_active and attacker == player else 1.0), knockback, attacker.global_position.x)
		attacker.power = minf(100.0, attacker.power + 6.0)
		_set_status("%s CONECTA %s" % [attacker.fighter_name, kind])

func _special() -> void:
	if player.power < 35.0 or not player.begin_attack(0.8):
		_set_status("ENERGÍA INSUFICIENTE · SP")
		return
	player.power -= 35.0
	var distance := absf(opponent.global_position.x - player.global_position.x)
	var in_front := signf(opponent.global_position.x - player.global_position.x) == player.facing
	if distance <= 4.0 and in_front:
		opponent.receive_hit(24.0 * (1.35 if max_active else 1.0), 5.0, player.global_position.x)
		_set_status("ESPECIAL CONECTADO")
	else:
		_set_status("ESPECIAL · FUERA DE RANGO")

func _activate_max() -> void:
	if player.power < 80.0 or max_active:
		_set_status("MAX REQUIERE 80 DE ENERGÍA")
		return
	player.power -= 80.0
	max_active = true
	max_time = MAX_DURATION
	_set_status("MAX ACTIVADO · 10 SEGUNDOS")

func _update_cpu(delta: float) -> void:
	if opponent.is_defeated:
		return
	ai_clock -= delta
	var distance := absf(player.global_position.x - opponent.global_position.x)
	if distance > 2.0:
		opponent.move_horizontal(signf(player.global_position.x - opponent.global_position.x) * 0.45, delta)
	else:
		opponent.move_horizontal(0.0, delta)
	if ai_clock <= 0.0 and distance < 2.3:
		ai_clock = 0.95
		_attack(opponent, player, "KICK" if randf() < 0.45 else "PUNCH")

func _update_hud() -> void:
	player_hp.value = player.health
	opponent_hp.value = opponent.health
	power_bar.value = player.power
	timer_label.text = str(ceili(round_time))
	if max_active:
		status_label.text = "MAX ACTIVO · %.1f s" % max_time

func _set_status(message: String) -> void:
	if is_instance_valid(status_label):
		status_label.text = message

func _on_fighter_defeated(fighter: PGFighter) -> void:
	match_running = false
	_set_status("%s DERROTADO" % fighter.fighter_name)

func _jump_player() -> void:
	player.jump()

func _punch_player() -> void:
	_attack(player, opponent, "PUNCH")

func _kick_player() -> void:
	_attack(player, opponent, "KICK")
