# Home Highlights — admin guide

Short, owner-facing guide. The screen is **Admin → Home → Highlights** (`/admin/highlights`).

## Before you start

- The master switch at the top turns the whole section on or off. When off, the home page has no
  section, heading, gap or loading skeleton.
- With no active slides the section is also hidden. You do not need to turn the feature off.
- Autoplay is off by default. If you turn it on, it runs only on tablet/desktop, pauses on hover,
  focus or touch, and never runs when the customer's device asks for reduced motion. The interval is
  4–12 seconds; 6 is a good start.
- The section heading comes from **Settings → Home → Highlights section title**. Leave both
  languages empty to hide the heading.

## Recommended images

| Image | Size | Ratio | Notes |
|---|---|---|---|
| Desktop | 1920×640 | 3:1 | Required. At least 1200 px wide. |
| Mobile (optional) | 960×640 or 960×540 | 3:2 / 16:9 | If omitted, the desktop image is cropped with the focal point. |
| File | JPEG/PNG/WebP | – | Maximum 5 MB; the uploader re-encodes it. |

Tips:

- Keep text, logos and faces **out of the image**; write the text in the overlay fields so it stays
  sharp, translatable and readable on small screens.
- Leave the focal point on the subject so narrow crops keep it visible (click the preview image).
- Use a calm image with a darker area for the text. The scrim + contrast warning help, but starting
  with a suitable image is better.
- Upload the mobile crop when the desktop composition loses the subject on a phone.
- Aim for 1–3 active slides at launch; more than five is usually ignored. The first slide gets the
  most views — put the most important message there.

## Editing a slide

1. Images: upload desktop (required) and mobile (optional), add Bangla/English alt text, set the
   focal point.
2. Content: optionally turn on overlay text; choose the position (3×3) and alignment separately for
   desktop and mobile; set text/scrim colors and opacity. The editor shows the estimated contrast.
3. Button: optional. Pick a token style (primary/secondary/outline) or custom colors. Text must have
   at least 3:1 contrast (4.5:1 is safer). If a slide has no button, use the whole-slide link.
   Links must start with `/` (internal) or `https://` (external).
4. Schedule: optional start/end. End must be after start.
5. Visibility: the active switch. A scheduled slide stays hidden until its start time.
6. Preview: switch Desktop/Mobile and বাংলা/English, then Save. Customers see a saved slide within
   seconds (cache tags are invalidated).

## Order, duplicate, delete

- Drag a row or use the up/down buttons; both save a single reorder.
- Duplicate creates a hidden copy — edit it, then make it active when ready.
- Delete removes the slide from the home page and deletes its images only if no other slide uses
  them. The confirmation names that consequence.

## Limits on purpose

- The server never trusts the browser: unsafe links, invalid colors, HTML in text, end-before-start
  schedules, unowned images and unreadable custom button colors are rejected with a clear message.
- Off-aspect or small images are accepted with a warning (the focal crop handles them) so you are
  not blocked while preparing artwork.
- The active visible slide count is capped by **Settings → Home → Maximum active highlights**
  (default 6, hard cap 10). Extra slides can stay as scheduled/future or hidden.
