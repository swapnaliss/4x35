---
title: "M4-03 · Demo video under 3 minutes (owner records)"
milestone: "M4 · Submission"
labels: ["owner", "docs", "critical"]
blocked_by: ["M4-01"]
estimate: "6h"
resources: []
needs: ["P-03", "P-10", "P-11", "P-12", "P-30", "P-31", "P-34"]
---

## Context
The rules require a public YouTube video under 3 minutes (PROJECT.md §1); Presentation is 20% of the
rubric and Best Demo is a bonus. The storyboard in PROJECT.md §2 ran for real at the end of M2 (M2-26).
The owner records and narrates; a worker drafts the script, shot list and captions and prepares the
data. Claims discipline: every number on screen or in the narration must be measured in the repo. Data
on screen is synthetic only. Swift's date is never presented as imminent.

## Scope
1. **Worker drafts** `docs/video/script.md`: narration per storyboard scene with timings that sum to
   ≤ 2:50, every number tagged with its claims-ledger entry, on-screen source captions for the stakes
   scene, and the wording rules applied.
2. **Worker drafts** `docs/video/shot-list.md`: per scene, the screen, the sandbox, the file used, the
   action, the zoom and the fallback screenshot.
3. **Worker prepares data**: a fresh judge-style sandbox reset just before recording (M3-09), the
   M2-24 demo files, the Crew channel (M3-04) and the Kiro windows (specs, a property test, steering, a
   hook) for the 2:10–2:45 scene.
4. **Owner records** the screen and narration, and edits (ffmpeg or any editor; asset tools disclosed in
   the README if used). Master file in `media/` (gitignored).
5. **Worker produces captions** `docs/video/captions.en.srt` from the final narration.
6. **Owner uploads** to YouTube as Public, title and description with the app URL, repo URL and
   "Kiroween 2026 hackathon"; adds captions. The worker fills the README video link.
7. Licence check for any music or image (free licence, credited in the description).

## Out of scope
- New product features or data for the video (if a scene cannot be shown live, fix forward via
  `BL-01` and the owning ticket, or use the M4-01 screenshot)
- Blog or social clips (M4-04)

## Acceptance Criteria
1. `ffprobe` reports the master file's duration < 180 s.
2. The YouTube video is public: the oEmbed endpoint returns 200 for the URL, and the owner's comment on
   the issue confirms the visibility is Public (not Unlisted).
3. Every number in `script.md` is in `docs/evidence/claims.md` (claims check run over the script).
4. `captions.en.srt` parses and its last cue ends before 3:00.
5. The README video link is filled with the YouTube URL.
6. The owner's comment on the issue confirms they recorded it, and lists any non-Kiro asset tools used
   (matching the README disclosure).

## Deliverables
- `docs/video/script.md`, `docs/video/shot-list.md`, `docs/video/captions.en.srt`
- README video link; YouTube URL on the issue
- `media/4x35-demo.mp4` (local, gitignored)

## Validation Gate
```bash
set -euo pipefail
d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 media/4x35-demo.mp4)
python3 -c "import sys; d=float('$d'); print(d); sys.exit(0 if d < 180 else 1)"
node scripts/check-claims.mjs docs/video/script.md docs/evidence/claims.md
url=$(grep -oE 'https://(www\.)?(youtube\.com/watch\?v=|youtu\.be/)[A-Za-z0-9_-]+' README.md | head -1)
test -n "$url"
curl -fsS -o /dev/null "https://www.youtube.com/oembed?url=$url&format=json"
python3 - <<'PY'
import re
t = open("docs/video/captions.en.srt").read()
ends = re.findall(r"--> (\d\d):(\d\d):(\d\d),(\d\d\d)", t)
assert ends, "no cues"
h, m, s, ms = map(int, ends[-1])
assert h * 3600 + m * 60 + s < 180, "captions run past 3:00"
print("captions ok")
PY
```

## Handoff
- **M4-04 (blog + social)**: the YouTube URL and a 30-second cut list for social.
- **M4-05 (Devpost)**: the YouTube URL for the video field.
- **M4-GATE**: the URL and the duration.
