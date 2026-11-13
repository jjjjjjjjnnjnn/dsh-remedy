# dsh-remedy — a patch set for the seams where a turn breaks

> **Unofficial.** This is an independent project, not affiliated with DeepSeek.

**Repository**: https://github.com/jjjjjjjjnnjnn/dsh-remedy
**Install**: `dsh plugin --profile <profile> add dsh-remedy`

dsh-remedy is a patch set rather than one wrapper. Each patch names one defect, the seam it touches, the evidence that it is fixed and what it does not do. It mounts on two resident seams, adds an offline `scan`, and answers with `explain` which patch covers a failure class your machine actually hits.

- **`llm/stream`**: a tool call whose argument text arrived as two JSON objects glued together is split only when the split is provable, and anything unprovable is re-thrown unchanged.
- **`agent/request-error`**: the deterministic refusals that used to end a turn in silence are named once per step, and a bounded retry budget exists but defaults to no retry.
- **CLI**: `scan` reads multi-frame zstd session logs and counts every way a turn ended; `explain` reads the registry and the profile you point it at.
- **Build side**: the byte budget is checked per load path, and the outward pages are checked against a fact pack.

`agent/pre-step` is measured but deliberately not mounted: a rejection closes the turn as `blocked` and the window reports it as completed, so the only candidate is rewriting the message with `{kind:'enter'}`, and that path is still unmeasured.

**Screenshot**: (pending — the plugin list with `dsh-remedy` mounted, or `dsh-remedy explain` output)

**Integration**: install into a profile, then run `dsh-remedy status`, `dsh-remedy explain --profile-file <cordis.patch.yml> --sessions <session dir>` and `dsh-remedy verify`.
