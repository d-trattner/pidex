import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROBE_PATH = ROOT / 'scripts' / 'provider-limits' / 'probe.py'
spec = importlib.util.spec_from_file_location('probe_module', PROBE_PATH)
probe = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(probe)


class ProbeNativeLimitsTest(unittest.TestCase):
    def test_latest_snapshot_collects_native_records_and_preserves_profiles(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            state = root / 'state' / 'provider-limits'
            profiles = root / 'config' / 'profiles'
            state.mkdir(parents=True, exist_ok=True)
            profiles.mkdir(parents=True, exist_ok=True)

            (profiles / 'codex-optimized.json').write_text('{}', encoding='utf-8')
            (profiles / 'codex-high.json').write_text('{}', encoding='utf-8')
            (state / 'active-profile.json').write_text(json.dumps({'active_profile': 'codex-high'}), encoding='utf-8')
            (state / 'native-records.json').write_text(json.dumps({
                'records': [
                    {'provider': 'codex', 'status': 'ok'},
                    {'provider': 'codex-spark', 'status': 'ok'}
                ]
            }), encoding='utf-8')

            old_root, old_state, old_profiles = probe.ROOT, probe.STATE, probe.PROFILES
            try:
                probe.ROOT = root
                probe.STATE = state
                probe.PROFILES = profiles
                data = probe.latest_snapshot()
            finally:
                probe.ROOT, probe.STATE, probe.PROFILES = old_root, old_state, old_profiles

            self.assertNotIn('recommended_profile', data)
            self.assertEqual(data['active_profile'], 'codex-high')
            self.assertEqual(data['profiles'], ['codex-high', 'codex-optimized'])
            providers = [row.get('provider') for row in data['records']]
            self.assertEqual(providers, ['codex', 'codex-spark'])


if __name__ == '__main__':
    unittest.main()
