---
title: "M4-04 · Blog post + social post (bonus)"
milestone: "M4 · Submission"
labels: ["docs", "owner"]
blocked_by: ["M4-02"]
estimate: "3h"
resources: []
needs: ["P-03", "P-36"]
---

## Context
Two bonus prizes (PROJECT.md §1): Blog (the post must mention "Kiroween 2026 hackathon") and Social
Blitz (#KiroweenHackathon26). The technical source is the Kiro write-up (M4-02). The worker drafts; the
owner publishes from their own accounts. Claims discipline and the wording rules apply to both posts.

## Scope
1. Draft `docs/posts/blog.md` (800–1,200 words): the dead technology (MT's 4 × 35 lines) and why its
   addresses outlived it; how 4x35 never invents a value (provenance kinds, property tests); how Kiro
   built it (specs, steering, hooks, the custom agent, MCP, the power, the Crew app); measured results
   with n; what it does not do; links (app, repo, video if ready, Crew repo). It mentions "Kiroween 2026
   hackathon" verbatim.
2. Draft `docs/posts/social.md`: one post per platform the owner chooses (length limits respected), each
   with #KiroweenHackathon26, the video or app link, and one image from `docs/screenshots/`.
3. Owner publishes the blog (platform of their choice) and the social post(s), and comments the URLs on
   the issue.
4. Check the current bonus rules on the Devpost page at drafting time (hashtag, required mention, tag of
   the Kiro account) and record them on the issue.

## Out of scope
- Paid promotion, more than one blog post
- New screenshots beyond `docs/screenshots/` (use what M4-01 captured)

## Acceptance Criteria
1. `blog.md` contains "Kiroween 2026 hackathon"; every post in `social.md` contains
   "#KiroweenHackathon26".
2. Every number in both drafts is in `docs/evidence/claims.md` (claims check).
3. Neither draft says the bank will accept anything or gives a Swift date as set.
4. The published blog URL and social post URL(s) are on the issue and return 2xx or 3xx.
5. The bonus rules recorded on the issue match the drafts (mention, hashtag, any required tag).

## Deliverables
- `docs/posts/blog.md`, `docs/posts/social.md`; published URLs on the issue

## Validation Gate
```bash
set -euo pipefail
grep -q 'Kiroween 2026 hackathon' docs/posts/blog.md
python3 - <<'PY'
import re
posts = [p for p in re.split(r"^## ", open("docs/posts/social.md").read(), flags=re.M)[1:]]
assert posts, "no posts"
for p in posts:
    assert "#KiroweenHackathon26" in p, p.splitlines()[0]
print(len(posts), "social posts ok")
PY
node scripts/check-claims.mjs docs/posts/blog.md docs/evidence/claims.md
node scripts/check-claims.mjs docs/posts/social.md docs/evidence/claims.md
! grep -niE 'will (accept|reject)' docs/posts/*.md
```

## Handoff
- **M4-05 (Devpost)**: the blog URL and social URLs for the bonus fields.
- **M4-GATE**: the URLs resolve.
