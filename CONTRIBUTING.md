# contributing

## setup

requires [bun](https://bun.sh) — not node.

```bash
git clone https://github.com/mellen9999/heatsync-extension
cd heatsync-extension
bun install
```

## build

```bash
bun run build.js           # both browsers
bun run build.js chrome    # chrome only
bun run build.js firefox   # firefox only
```

after building, reload the extension in your browser:
- chrome: `chrome://extensions` → reload
- firefox: `about:debugging` → reload

## test

```bash
bun test
```

## code style

- no semicolons
- 2-space indent
- es modules (`import`/`export`)
- conventional commits: `feat:`, `fix:`, `refactor:`, `chore:`

## submitting a pr

1. fork, branch off `main`
2. keep commits small and atomic
3. run `bun run build.js && bun test` before pushing
4. open a PR against `main` — describe what changed and why
5. don't force push

## source layout

edit files under `chrome/` — that's the source. `dist/` is generated and gitignored.
shared modules in `src/lib/` are bundled into content scripts at build time.
