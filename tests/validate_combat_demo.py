import pathlib
import re
import subprocess
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
HTML = ROOT / "Puente_Grande_3D_Prueba.html"


class CombatDemoChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = HTML.read_text(encoding="utf-8")
        match = re.search(r"<script>([\s\S]*?)</script>", cls.html)
        if not match:
            raise AssertionError("No se encontró el script principal en el HTML")
        cls.script = match.group(1)

    def test_html_has_main_game_canvas_and_controls(self):
        self.assertIn('id="game"', self.html)
        self.assertIn('data-act="special"', self.html)
        self.assertIn('data-hold="left"', self.html)
        self.assertIn('id="start"', self.html)

    def test_combat_safety_rules_are_present(self):
        required = [
            "const STEP=1000/60",
            "while(accumulator>=STEP&&steps<5)",
            "def.guard&&def.face===-attacker.face",
            "((enemy.x-f.x)*f.face>0)",
            "Math.abs(enemy.y-f.y)<.18",
            "function resolvePushboxes()",
            "maxTicks=600",
            "p.pow=Math.max(0,p.pow-.35)",
            "if(!a||!a.hit)return false",
            "pow:isTraining?3:0",
            "if(k==='jump'){if(!e.repeat)action('jump')}",
            "function clearInputs(){keys={};touch={};manualGuard=false;p.guard=false;o.guard=false}",
            "addEventListener('blur',clearInputs)",
            "if(document.hidden)clearInputs()",
            "o.attack=null;o.y=0;o.vy=0",
            "clearInputs();$('#menu').style.display='flex';running=false",
        ]
        for snippet in required:
            with self.subTest(snippet=snippet):
                self.assertIn(snippet, self.script)

    def test_special_cost_is_not_charged_again_on_hit(self):
        self.assertIn("p.pow=Math.max(0,p.pow-.35)", self.script)
        self.assertIn("El coste se descuenta al iniciar el especial.", self.script)
        self.assertNotIn("p.pow-=.35", self.script)

    def test_javascript_syntax(self):
        with tempfile.NamedTemporaryFile("w", suffix=".js", encoding="utf-8", delete=False) as f:
            f.write(self.script)
            path = f.name
        try:
            result = subprocess.run(
                ["node", "--check", path],
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(
                result.returncode,
                0,
                msg=(result.stdout + result.stderr).strip() or "node --check falló",
            )
        finally:
            pathlib.Path(path).unlink(missing_ok=True)


if __name__ == "__main__":
    unittest.main(verbosity=2)
