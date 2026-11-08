"""Ask Claude a question from Python, through the local Claude Code CLI.

Uses this machine's Claude Code login, so no API key is needed.
Anything you send goes to Anthropic: don't send real patient data.

From Python:
    from claude_client import ask
    print(ask('Explain sparse autoencoders in two sentences.'))
    info = ask('Name this cluster: insulin, heparin, warfarin',
               schema={'type': 'object', 'required': ['name'],
                       'properties': {'name': {'type': 'string'}}})   # -> dict

From a terminal:
    python claude_client.py "Explain AI like I am five" --model claude-sonnet-5-5
"""
import argparse
import json
import shutil
import subprocess
import tempfile

MODEL = 'claude-haiku-5-5'   # cheapest; or 'claude-sonnet-5-5' / 'claude-opus-5-5'


def ask(prompt: str, system: str | None = None, model: str = MODEL,
        schema: dict | None = None, timeout: int = 180):
    """One prompt in, one answer out. Returns text, or a dict that matches `schema`."""
    claude = shutil.which('claude')
    if not claude:
        raise RuntimeError('claude CLI not found on PATH; install Claude Code or start from a shell where it is.')
    cmd = [claude, '-p', '--model', model, '--tools', '', '--strict-mcp-config',
           '--disable-slash-commands', '--no-session-persistence', '--output-format', 'json']
    if system:
        cmd += ['--system-prompt', system]
    if schema:
        cmd += ['--json-schema', json.dumps(schema)]
    cmd += ['--', prompt]   # '--' so prompts starting with '-' (e.g. '-Goal-') aren't read as options
    # Run from a temp dir so no project CLAUDE.md is pulled into the prompt.
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout,
                          cwd=tempfile.gettempdir(), stdin=subprocess.DEVNULL)
    try:
        record = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f'claude exited {proc.returncode}: {proc.stderr[:300] or proc.stdout[:300]}') from exc
    if record.get('is_error'):
        raise RuntimeError(f'claude returned an error: {record.get("result")!r} '
                           '(if it mentions OAuth/login, run `claude` in a terminal to log in again)')
    return record['structured_output'] if schema else record['result']


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Ask Claude one question.')
    parser.add_argument('prompt')
    parser.add_argument('--model', default=MODEL)
    parser.add_argument('--system', default=None)
    args = parser.parse_args()
    print(ask(args.prompt, system=args.system, model=args.model))
