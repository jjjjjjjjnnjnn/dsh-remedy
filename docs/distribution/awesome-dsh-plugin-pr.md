name: add dsh-remedy

A patch set for DeepSeek Harness that repairs fused tool-call argument text at the
`llm/stream` seam and re-throws whatever it cannot prove. It also listens on
`agent/request-error` to name the deterministic refusals it will not retry, answers
per failure class which patch covers it (and whether that patch is switched on in
the profile you point at), and reads multi-frame zstd session logs offline.

- Repo: https://github.com/jjjjjjjjnnjnn/dsh-remedy (MIT)
- Bundle: `packages/plugin` declares `dsh.bundle.patch: ./cordis.patch.yml`
- npm: `dsh-remedy` (the plugin) and `dsh-remedy-core` (the engine it pins exactly)
- DSH compatibility: `>=0.2.0-rc.1 <0.3.0-0` (measured on 0.2.2-rc.3)
- One entry added, `data/plugins/jjjjjjjjnnjnn__dsh-remedy--packages-plugin.yml`;
  the generated READMEs are left alone.

The description carries no numbers on purpose: this list reads each sentence as a
claim about the source, and the four claims here each point at code — the proven
split at `llm/stream`, the named refusals at `agent/request-error`, the coverage
answer in `explain`, and the offline census in `scan`. Every patch in the registry
records the seam it touches, the evidence it leaves and the limits it does not
cross; `dsh-remedy status` prints that registry and `gate_registry` refuses a
claim whose evidence file is missing.
