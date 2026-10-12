# WhatsApp Chat UI — Design Spec

A visual spec for recreating the WhatsApp chat interface (dark theme) on mobile (iOS) and web/desktop. It was derived from the reference screenshots in `sample/`. It covers only appearance and UI behavior. Data sources and app logic are out of scope.

| Reference | Shows |
|---|---|
| `WEB VIEW_GROUP_URL PREVIEW_REPLY.png` | Web 3-column layout, group header, large link preview, reply quote, chat list with community labels |
| `WEB VIEW_PERSONAL_CALL_LOG.png` | Web personal chat, image + caption, outgoing reply with thumbnail, missed-call cards, date pill |
| `MOBILE_GROUP_REPLY.PNG` | Mobile group, reply quotes with thumbnail, member tag, letter avatars |
| `MOBILE_GROUP_STICKER_REPLY.PNG` | Sticker with reaction overlay, time pill, reply quote, link-preview start |
| `MOBILE_GROUP_URL PREVIEW_EMOJI REACTION.PNG` | Large link preview, reaction pill, compact link-quote, sticky date pill |
| `MOBILE_GROUP_IMAGE ATTACHMENT_LINK_REPLY.PNG` | Image + caption in group, forward button, reply + link |
| `MOBILE_PERSONAL_VN_CALL LOG_MULTIPLE DAY.jpg` | Outgoing bubbles + read ticks, voice note, missed voice call, day separators |
| `MOBILE_PERSONAL_CALL LOG_MULTIPLE DAY.PNG` | Video-call cards, missed video call, consecutive-bubble grouping |

All colors and sizes are measured from the screenshots and are approximate. Mobile values are in CSS px at 1× (the screenshots are about 2× retina, 725px wide ≈ 390pt device). Check them with an eyedropper against `sample/` when building.

---

## 1. Design tokens

### 1.1 Color (dark theme)

| Token | Mobile | Web | Used for |
|---|---|---|---|
| `--bg-chat` | `#0B0B0B` | `#161717` | Chat background |
| `--wallpaper-stroke` | — | `rgba(255,255,255,0.04)` | Doodle pattern lines on web |
| `--bg-header` | `rgba(18,18,18,0.92)` + backdrop blur 20px | `#161717` | Top bar of the chat |
| `--bg-composer` | `#121212` | `#161717` | Bottom input bar area |
| `--bg-input` | `#1F2121` | `#242626` | Message input pill, search field |
| `--bg-panel` | — | `#161717` | Chat list column |
| `--bg-rail` | — | `#1D1F1F` | Leftmost icon rail |
| `--bg-list-hover` | — | `#242626` | Chat list row hover |
| `--bg-list-active` | — | `#2E2F2F` | Selected chat row |
| `--bubble-in` | `#242626` | `#242626` | Incoming bubble |
| `--bubble-out` | `#144D37` | `#144D37` | Outgoing bubble |
| `--quote-in` | `#1B1D1D` | `#1D1F1F` | Reply block inside an incoming bubble |
| `--quote-out` | `#0F3D2C` | `#0F3D2C` | Reply block inside an outgoing bubble |
| `--card-inner` | `#1B1D1D` | `#1D1F1F` | Call card inner panel, link-preview body |
| `--icon-circle` | `#141515` | `#1D1F1F` | Circle behind call icons |
| `--text-primary` | `#FFFFFF` | `#FAFAFA` | Message text, titles |
| `--text-secondary` | `rgba(255,255,255,0.60)` | `rgba(255,255,255,0.60)` | Timestamps, phone numbers, subtitles |
| `--text-tertiary` | `rgba(255,255,255,0.40)` | `rgba(255,255,255,0.40)` | Placeholder ("Type a message") |
| `--icon` | `#FFFFFF` | `rgba(255,255,255,0.75)` | Header and composer icons |
| `--accent` | `#21C063` | `#21C063` | Mic button, links, unread badges, unread time, "Turn on" |
| `--accent-on` | `#0B0B0B` | `#0B0B0B` | Icon color on an accent fill |
| `--tick-read` | `#53BDEB` | `#53BDEB` | Blue double tick, played voice-note dot/mic |
| `--tick-sent` | `rgba(255,255,255,0.60)` | same | Grey single/double tick |
| `--danger` | `#F15C6D` | `#F15C6D` | Missed-call glyphs |
| `--pill-bg` | `#1C1D1D` | `#1D1F1F` | Date pill, system pill, sticker time pill |
| `--fab-bg` | `#1F2121` | `#1F2121` | Scroll-to-bottom, forward button |
| `--divider` | `rgba(255,255,255,0.08)` | same | Hairlines, chip borders |
| `--banner-bg` | — | `#103529` | Green notification banner, active chip |
| `--badge-bg` | `#21C063` | `#21C063` | Unread count badge |
| `--community-tile` | `#3B1F2B` | `#3B1F2B` | Pink community icon tile background |
| `--community-glyph` | `#FF5C8A` | `#FF5C8A` | Community glyph |

#### Theme variants (general WhatsApp knowledge, not sampled)

The screenshots use the 2024+ redesign: neutral greys and a brighter `#21C063` green. WhatsApp has shipped two other palettes worth supporting:

| Token | Light (current) | Classic dark (pre-2024, blue-grey) |
|---|---|---|
| `--bg-chat` | `#EFEAE2` (beige + doodle) | `#0B141A` |
| `--bg-header` | `#F0F2F5` (web) / `#F6F5F3` (iOS) | `#202C33` |
| `--bg-panel` | `#FFFFFF` | `#111B21` |
| `--bg-input` | `#FFFFFF` (composer) / `#F0F2F5` (search) | `#2A3942` |
| `--bubble-in` | `#FFFFFF` | `#202C33` |
| `--bubble-out` | `#D9FDD3` | `#005C4B` |
| `--quote-in` | `#F5F6F6` | `#1D282F` |
| `--quote-out` | `#D1F4CC` | `#025144` |
| `--text-primary` | `#111B21` | `#E9EDEF` |
| `--text-secondary` | `#667781` | `#8696A0` |
| `--accent` | `#1DAA61` (links `#027EB5`, buttons `#008069`) | `#00A884` |
| `--tick-read` | `#53BDEB` | `#53BDEB` |
| `--pill-bg` | `#FFFFFF` (shadowed) | `#182229` |
| `--divider` | `#E9EDEF` | `rgba(134,150,160,0.15)` |
| `--danger` | `#EA0038` | `#F15C6D` |

In light mode, bubbles and pills get `box-shadow: 0 1px 0.5px rgba(11,20,26,0.13)`. Sender-name colors use darker variants (e.g. `#1F7AEC`, `#D3396D`, `#C75300`, `#008069`) to keep contrast on white.

### 1.2 Sender name colors (groups)
Each group member gets a fixed color from a deterministic hash of their ID. The same color is used for their name in bubbles, the left bar of quotes that reference them, and their letter-avatar tint.

```
#53BDEB blue      #06CF9C green     #FC9775 peach     #FF72A1 pink
#42C7B8 teal      #F1795C salmon    #A791FF purple    #FFD279 yellow
#25D366 lime      #E26AB6 magenta   #7F66FF violet    #5FB8F2 sky
#DFB43F mustard   #FA6533 orange    #A5B337 olive     #C68C5D tan
```
Seen in screenshots: blue (`~dikaardnt.com`, `~rifalos.id`, `~mmoaa`), peach (`~Thorfin`, `~Innocent`, `~Arizona`, `~f`), green (`~M Faiz Hidayat`, `~daffa`, `~Marketku.id`), pink (`~~`, `~ald_`), teal (`~Sans`), salmon (`~Yuda Prasetya`), purple (`~ 0xcidS`, `Ellrica MT POS 26` in an outgoing quote), yellow (`~ Iamzulx`).

Letter-avatar backgrounds use the same hue darkened to about 30–35% lightness, with the letter in a pale tint of the hue. Seen: brown `#5A3A2A` with `#F3C9A8` for "T"/"F", maroon `#5C1F33` with `#F6B5C8` for "A"/"Y", dark teal `#0E4D4A` with `#A9E8E0` for "S".

### 1.3 Typography
Font: `-apple-system, "SF Pro Text", "Segoe UI", "Helvetica Neue", Roboto, "Noto Sans", Arial, sans-serif`. Emoji: `"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"`.

| Role | Mobile | Web |
|---|---|---|
| Message text | 17px / 22px, 400 | 14.2px / 19px, 400 |
| Single emoji only | 48px | 40px |
| 2–3 emoji only | 36px | 32px |
| Sender name | 15px / 20px, 500 | 12.8px / 18px, 500 |
| Sender phone / handle | 14px, 400, secondary | 12px, 400, secondary |
| Member tag (under name) | 14px, 400, secondary | 12px, 400, secondary |
| Quote sender | 15px, 500 | 12.8px, 500 |
| Quote text | 14px / 19px, 2-line clamp | 13px / 18px, 3-line clamp |
| Timestamp in bubble | 12px, 400, secondary, `tabular-nums` | 11px, 400, secondary |
| Date pill | 14px, 600 | 12.5px, 500 |
| Chat header title | 18px, 600 | 16px, 500 |
| Chat header subtitle | 14px, secondary | 13px, secondary |
| Call card title | 17px, 600 | 14.5px, 500 |
| Call card subtitle | 16px, secondary | 13px, secondary |
| Link preview title | 16px / 22px, 600, 2 lines | 13.5px / 18px, 600, 2 lines |
| Link preview description | 15px / 21px, secondary, 3 lines | 12.5px / 17px, secondary, 2 lines |
| Link preview domain | 15px, secondary | 12px, secondary |
| Voice note duration | 13px, secondary, `tabular-nums` | 11px |
| Chat list name | — | 16px / 21px, 400 |
| Chat list preview | — | 14px / 20px, secondary |
| Chat list time | — | 12px, secondary (accent when unread) |
| Chat list community label | — | 12.5px, secondary (above name) |
| Web app title "WhatsApp" | — | 22px, 600 |

### 1.4 Spacing, radius, sizes

| Token | Mobile | Web |
|---|---|---|
| Bubble corner radius | 18px | 7.5px |
| Bubble padding (text) | 7px 10px 8px 12px | 6px 7px 8px 9px |
| Bubble max width | ~82% of chat width | 65% (personal), ~60% (group) |
| Bubble min width | 56px | 48px |
| Gap within a run (same sender) | 3px | 2px |
| Gap between runs | 10px | 12px |
| Chat side margins | 12px | ~6% of pane width each side, min 24px |
| Group avatar size | 36px (bottom of the run) | 28px (top of the run) |
| Avatar column width | 46px | 38px |
| Tail size | 8 × 13px | 8 × 13px |
| Date pill | padding 4px 12px, radius 8px, min width 120px | 5px 12px, radius 7.5px |
| Date pill vertical margin | 24px top / 16px bottom | 12px |
| Quote block radius | 12px | 6px |
| Quote bar width | 4px | 4px |
| Media inset inside bubble | 3px | 3px |
| Media radius | 15px | 6px |
| Sticker size | 160px max | 190px max |
| Header height | 52px + status bar | 60px |
| Composer height | 50px + home-indicator safe area | 62px |
| Scroll-to-bottom button | 40px circle | 42px circle |
| Forward button | 40px circle | 26px icon (no fill) |
| Web rail width | — | 64px |
| Web chat list width | — | 30% of window, min 340px, max 470px |
| Web chat list row height | — | 72px, avatar 49px |

Elevation: in dark mode, bubbles have no shadow. Floating buttons use `0 1px 3px rgba(0,0,0,0.4)`. Light-theme bubbles use `0 1px 0.5px rgba(11,20,26,0.13)`.

### 1.5 Icons
Outline icon set, 1.75–2px stroke, rounded caps (SF Symbols-like on iOS, Material-like on web). Sizes: header 24px (mobile 26px), composer 26px, inline (preview type icons, ticks) 14–16px. Needed glyphs: chevron-left, chevron-down, phone, video, search, more-vertical (⋮), plus, sticker (folded-corner square), camera, mic, paperclip, emoji/sticker face, link, play, pause, forward (curved arrow), bell-off, photo, video-camera, GIF badge, check, double-check, phone-missed (↙ with phone), video-missed, people/community, close (✕), new-chat.

---

## 2. Layouts

### 2.1 Mobile (iOS)

```
┌──────────────────────────────────────────────┐
│ 21.04                          ▂▄▆ 📶 [96⚡]  │ iOS status bar
├──────────────────────────────────────────────┤
│ ‹  (av) General                 [👥✓]  📞⌄   │ group header
│         Rifqi MT, ~!, ~~andri aditya,…       │
├──────────────────────────────────────────────┤
│                [ Tue, 15 Sep ]               │ sticky date pill (floats)
│   ┌~Thorfin        +62 896-7816-8872┐        │
│   │┌──────────────────────────────┐ │   (➦)  │ forward button
│   ││          image               │ │        │
│   │└──────────────────────────────┘ │        │
│   │ di luar laku 50$ nih :v    09.59│        │
│(T)└─────────────────────────────────┘◣       │ avatar + tail on LAST bubble
│                                        (⌄)   │ scroll-to-bottom
├──────────────────────────────────────────────┤
│ ＋  [                          🗒 ]  📷  (🎤) │ composer
│                  ━━━━━━━                     │ home indicator
└──────────────────────────────────────────────┘
```

Group header (left → right):
- `‹` chevron, 24px, 16px from the left edge.
- Group avatar, 40px circle. A grid-like group icon is shown in the screenshot.
- Title (18px 600) over subtitle (14px secondary, comma-joined member names, single-line ellipsis).
- Community tile: a 36px rounded-square (radius 8px) in `--community-tile` with a pink people glyph and a small white circular ✓ badge at bottom-right.
- Phone icon + small chevron-down (call menu).

Personal header:
- `‹` + unread chats count (`111`, 18px 400), right next to the chevron.
- 40px avatar with a 2px `--accent` ring and 2px gap (unseen status ring). Without status there's no ring.
- Name (18px 600) only, vertically centered.
- Video icon (28px), then phone icon (24px), with a 24px gap.

The header is translucent: content blurs underneath it. A hairline `--divider` sits at the bottom edge. It's invisible when at rest at the top.

Composer (mobile):
- `＋` icon 26px at 16px from the left.
- Input pill: `--bg-input`, height 36px, radius 18px, flex-grow, 12px horizontal margins. The sticker icon (24px, `--icon`) sits at the right inside the pill.
- Camera icon 26px.
- Mic button: 44px circle filled `--accent` with a black mic glyph (`--accent-on`). When the input has text, it becomes a send button (same circle, paper-plane glyph).
- Background `--bg-composer`, top hairline `--divider`.

### 2.2 Web / desktop

```
┌────┬────────────────────────────┬──────────────────────────────────────────────────────┐
│(💬)│ WhatsApp            ⋮ (✚) │ (av) General                     [👥]⌄  🎥⌄ │ 🔍  ⋮    │
│ 89 │ [🔍 Search or start a new…]│      M., Quin, Rifqi, +62 857-7661-9935, +62 895-…   │
│ 📞 │ (All) (Unread 108) (Commu… │──────────────────────────────────────────────────────│
│ 15 │ ┌────────────────────────┐ │ (wallpaper pattern)                                  │
│ ◎• │ │🔕 Message and call     ✕│ │   (av) ┌~ Nado               @benakdoh┐             │
│ 💭•│ │   notifications are off │ │        │ [ link preview image       ]│  ➦          │
│ 👥 │ │   Get notifications…Turn on│        │ title / desc / domain       │             │
│────│ └────────────────────────┘ │        │ https://vt.tiktok.com/…  20:50│             │
│ ✿  │ DevsAndAi            21:10 │        └─────────────────────────────┘             │
│    │ (av) General           🔕  │                                                      │
│    │      ~Rakha Fikri joined…  │                                                      │
│    │ (av) Member & Alumni… 20:50│                                                      │
│    │      ✓ You: 🗒 Sticker  🔕 │                                               (⌄)    │
│ 🖼 │ …                          │──────────────────────────────────────────────────────│
│(me)│ [🟢 Get WhatsApp for Windows]│ 📎  🙂  Type a message                           🎤   │
└────┴────────────────────────────┴──────────────────────────────────────────────────────┘
```

Rail (64px, `--bg-rail`, icons 24px, centered, 56px row pitch):
- Top: Chats (active: 40px `--bg-list-active` circle behind the icon, green badge `89`), Calls (badge `15`), Status (green 8px dot), Channels (green dot), Communities.
- A divider, then Meta AI (purple/blue ring glyph).
- Bottom: Media/Archive icon, then the 32px profile avatar.
- Badge: `--badge-bg`, min 18px height, 10px font 600, radius 9px, black text, offset top-right of the icon.

Chat list column:
- Header row (64px): "WhatsApp" title (22px 600), ⋮ icon, and a new-chat button (36px circle `--accent` with a black icon).
- Search field: `--bg-input`, 40px tall, radius 20px, 🔍 at 12px left, placeholder "Search or start a new chat".
- Filter chips row (12px gap): pills 32px tall, padding 0 12px, radius 16px, 1px `--divider` border, 14px text. Counts sit in secondary text (`Unread 108`). Active chip (`All`): `--banner-bg` fill, `--accent` text, no border. Last chip is a `+` circle.
- Notification banner: `--banner-bg`, radius 12px, 16px padding, 12px margin. Bell-off icon 24px; title 15px 600 "Message and call notifications are off"; body 14px secondary "Get notifications for messages, groups, or calls." + "Turn on" link in `--accent`; ✕ at the right.
- Rows (see §3.20).
- Footer: "Get WhatsApp for Windows" in `--accent`, with the green app tile icon, centered, top hairline.
- Column right border: 1px `--divider`.

Chat pane:
- Header (60px): 40px avatar; title 16px 500; subtitle 13px secondary (group members, single-line ellipsis). Right: for groups, the community tile + chevron and video icon + chevron. For personal chats, video icon and phone icon. Then a vertical 1px divider, 🔍, ⋮. 24px gaps between icon groups.
- Body: `--bg-chat` with a repeating doodle pattern tile (~400×400px, line art in `--wallpaper-stroke`).
- Composer (62px): a 52px tall rounded container in `--bg-input`, radius 26px, with 12px outer margin. Inside, left to right: 📎 paperclip, 🙂 emoji/sticker face, input (placeholder "Type a message", 15px), and 🎤 at the far right (turns into send ➤ when typing). Icons 24px, `--icon`.

### 2.3 Breakpoints
- < 768px: mobile layout (single pane, iOS-style bubbles, §3.2 tail rules "mobile").
- 768–1023px: two columns (chat list 320px + chat pane). Rail hidden.
- ≥ 1024px: full three-column web layout.

---

## 3. Components

### 3.1 Bubble anatomy

```
 ┌─────────────────────────────────────────┐
 │ ~ Sender Name            +62 812-…      │ ← sender header (groups, incoming, first of run)
 │ member tag                              │ ← optional
 │ ┃ ~ Quoted Name     +62 …        [img]  │ ← reply quote (optional)
 │ ┃ quoted text …                         │
 │ [ media / link preview / card ]         │ ← optional
 │ Message text that wraps naturally and   │
 │ the meta sits at the end    Edited 07.19 ✓✓│ ← meta inline at the end
 └─────────────────────────────────────────┘◣ tail
```

- Incoming: left aligned, `--bubble-in`. Outgoing: right aligned, `--bubble-out`.
- Meta block = optional `Edited` + time + (outgoing only) ticks. It is bottom-right inside the bubble.
  - If the last text line leaves room, the meta shares that line (`Rasis amat  07.19`, `P  07.57`).
  - Otherwise it drops to its own line, right-aligned (`Besok Bpk ksh … / semuanya    21.57`).
  - Technique: append an invisible inline spacer equal to the meta width + 8px to the text, and absolutely position the meta at `right: 8px; bottom: 6px`.
- Ticks (outgoing): 16×11px. Single ✓ grey = sent, ✓✓ grey = delivered, ✓✓ `--tick-read` = read. 3px left of time gap.
- Text supports `*bold*`, `_italic_`, `~strike~`, `` `inline code` ``, ```` ```mono``` ````, `> quote` lines and lists. URLs/emails/phones are linkified in `--accent`, underlined (`https://github.com/sanhaji182`).
- Emoji-only messages (1–3 emoji) render jumbo with no bubble background. The time pill style is the same as stickers (§3.8).
- Text uses `overflow-wrap: anywhere` and `dir="auto"`.

### 3.2 Grouping (runs) and tails
Consecutive messages form a run when they have the same sender and the same day, with no interruption by another sender, a system message or a date pill.

| | Mobile (iOS) | Web |
|---|---|---|
| Tail | On the last bubble of a run, at the bottom outer corner | On the first bubble of a run, at the top outer corner |
| Sender header (group) | First bubble of the run | First bubble of the run |
| Avatar (group, incoming) | Beside the last bubble, bottom-aligned | Beside the first bubble, top-aligned |
| Middle bubbles | Fully rounded (18px all corners) | 7.5px all corners |

Examples:
- `MOBILE_PERSONAL_CALL LOG_MULTIPLE DAY.PNG`: four incoming bubbles where only "Tapi ndak pernah cair…" has the tail.
- `MOBILE_GROUP_REPLY.PNG`: two `~Innocent` bubbles, where the avatar and tail are only on the second one.

Tail shapes (SVG, filled with the bubble color):
- Mobile: a soft swoosh curving out from the bottom corner, 8px wide, 13px tall. The bubble's bottom-outer radius blends into it.
- Web: a sharp triangular nub at the top corner. The bubble's top-outer radius becomes 0 on that bubble.

Bubbles without a tail keep the same horizontal position as tailed ones; the tail sits outside the bubble edge.

### 3.3 Sender header (groups)
- Row: name left, identifier right (`margin-left: auto`, min gap 16px). Single line, and the name ellipsizes first.
- Name in the sender color, 500 weight. Contacts that aren't saved show a `~` prefix followed by a thin space (`~ Thorfin`).
- Identifier in secondary: a phone number (`+62 896-7816-8872`) for unsaved contacts, or `@handle` (web example `@benakdoh`). Saved contacts show the name only.
- Optional member tag: a second line in secondary text (`penikmat bansos`, `free plan enjoyer`).
- Shown only for incoming messages in groups, on the first bubble of a run. 2px bottom margin before the content.

### 3.4 Avatar
- Circle. Image if available, otherwise a letter avatar: first letter, uppercase, 16px 500 (mobile 36px circle), with the darkened sender color behind it (§1.2).
- Generic fallback for numbers without a name: a person glyph in pink on a maroon background (seen beside `~~`).
- Groups: incoming only, in a fixed avatar column so all bubbles of the group stay aligned.

### 3.5 Date separator
- Centered pill, `--pill-bg`, text white 600 (mobile) / secondary-white 500 (web).
- Labels: `Today`, `Yesterday`, weekday within the last 7 days (`Thursday`, `Friday`), then `Tue, 15 Sep` (mobile, same year) / `15 September 2025` style on web for older dates.
- Sticky behavior: while scrolling, a floating copy of the current section's pill is pinned 8px below the header. It sits on top of the bubbles (seen overlapping "Besok Bpk ksh bers…" with `Thursday`, and `~rifalos.id` with `Tue, 15 Sep`). It fades out (200ms) about 1.5s after scrolling stops.

### 3.6 System message
- Same pill shape as the date pill, but text is 400 weight secondary, max width 85%, centered, multi-line allowed.
- Examples: `~Rakha Fikri joined via an invite link`, `X added Y`, `X changed the group name`.
- Encryption notice variant: 🔒 icon + text in `#FFD279` on `--pill-bg`.

### 3.7 Image / video / GIF
- Sits inside the bubble with a 3px inset. The image corner radius is the bubble radius − 3px.
- Group: the sender header sits above the image inside normal padding. The image then spans the full inner width (seen with `~Thorfin` screenshots).
- Sizing: keep the aspect ratio. Width up to ~330px (mobile: bubble max width). Height clamped to 100–440px using `object-fit: cover`.
- With caption: the text is below the image with normal bubble padding, and the meta is inline with the caption (`done 1k bang 🚀   10.09`).
- Without caption: the time and ticks are white, overlaid at bottom-right on a 28px gradient scrim `linear-gradient(transparent, rgba(0,0,0,0.5))`.
- Video: centered 56px play circle `rgba(0,0,0,0.5)` with a white ▶. Bottom-left shows 🎥 + duration on the scrim.
- GIF: a `GIF` badge in the same position. Plays muted in a loop.
- Album (4+ images): 2×2 grid with 2px gaps. The last tile shows `+N` over a 50% black overlay.
- Loading state: `--card-inner` box with a subtle shimmer at the final size.

### 3.8 Sticker
- No bubble, transparent background, max 160px (mobile) / 190px (web).
- Group: the sender header is shown as its own small bubble above the sticker (`~dikaardnt.com  +62 882-9202-4190`). That bubble has a tail, and the sticker sits below it with no bubble.
- Time: a separate small pill (`--pill-bg`, radius 12px, padding 4px 10px, 12px secondary) below the sticker at its leading edge (`07.19`). The avatar aligns to this pill row.
- A reaction emoji can overlap the bottom-center of the sticker (😂 in the screenshot), using the reaction rules in §3.11 without the pill background.

### 3.9 Link preview

Large variant (mobile `tasteskill.dev`, web TikTok):
```
┌───────────────────────────────────────┐
│ ~ rifalos.id         +62 822-6105-1922│ sender header
│ rifalosid.com                         │ optional site/member line (secondary)
│┌─────────────────────────────────────┐│
││          og:image (1.91:1)          ││ full inner width, top radius only
│├─────────────────────────────────────┤│
││ Taste Skill | The Anti-Slop Fronte… ││ title, 600, 2 lines
││ Taste Skill gives your AI agent…    ││ description, secondary, 3 lines
││                                     ││
││ 🔗 tasteskill.dev                   ││ domain row (mobile)
│└─────────────────────────────────────┘│ --card-inner
│ https://vt.tiktok.com/ZS9DK3rjeXP…    │ URL text in --accent (web shows it)
│                                 22.11 │
└───────────────────────────────────────┘
```
- On mobile, the preview card fills the bubble, and the meta sits on its own line at the bottom.
- On web, the card is `--card-inner`, radius 6px, with 3px inset. The domain sits below the description (`vt.tiktok.com`, secondary). The URL text follows as a link.

Compact variant (small og:image): an 88×88 thumbnail on the right side of the card, with the title, description and domain stacked on the left.

### 3.10 Reply quote
- A block inside the bubble above the body, spanning the full inner width. It has a 4px top margin and a 6px bottom margin.
- Background: `--quote-in` in incoming bubbles, `--quote-out` in outgoing ones. Radius: 12px mobile / 6px web. Overflow hidden.
- Left bar: 4px, full height, in the quoted sender's color.
- Content padding: 8px 12px.
  - Line 1: quoted sender name (sender color, 500) + phone right-aligned (secondary). When quoting yourself: `You`.
  - Line 2+: quoted text (2-line clamp on mobile, 3 on web). Media quotes show a type icon + caption or label: `🖼 woi beresin`, `📷 Photo`, `🎤 Voice message (0:06)`, `🗒 Sticker`.
- Optional thumbnail: a square on the right edge, full block height (~64–88px), `object-fit: cover`, no gap. Its outer corners match the block radius. Seen: chess knight, `tasteskill` image, food photo on web.
- A quoted link shows the URL as plain text (not green) inside the quote (`https://t.me/+QU9FNqc3DRtlY2Zl`).
- Hover (web): slight brightening (`filter: brightness(1.08)`). Click scrolls to the original message and flashes it (`rgba(255,255,255,0.08)` overlay, 1.5s fade).

### 3.11 Reactions
- A pill that overlaps the bubble's bottom edge: its center sits on the bubble's bottom border. Offset 12px from the bubble's leading edge (incoming) or trailing edge (outgoing).
- Style: `--pill-bg`, 2px solid border in `--bg-chat` (creates a cutout effect), radius 14px, padding 2px 7px, emoji 18px (mobile 20px). Seen: 🙏 under the tasteskill preview.
- Multiple: up to 3 distinct emoji side by side, then a count in 12px secondary (`👍😂 3`).
- The next message gets extra top margin (+14px) so the pill doesn't collide.

### 3.12 Voice note
```
┌──────────────────────────────────────────────────┐
│   ▶   ●ı|ı|ıı|||ı|ıı|ı··················  ┌────┐ │
│                                           │ av │ │
│       0:06                       13.57  🎤└────┘ │
└──────────────────────────────────────────────────┘
```
- Bubble width ~ 300px (mobile, 70% of screen) / 300–340px web. Padding 10px 12px.
- Play button: ▶ triangle, 28px, `rgba(255,255,255,0.6)`, no circle. It becomes ⏸ while playing.
- Waveform: ~45 vertical bars, 3px wide, 2px gaps, rounded ends, heights 4–24px, centered vertically.
  - Unplayed bars: `rgba(255,255,255,0.35)` (later bars drop to tiny dots, which mimics silence).
  - Played portion and seek knob: `--tick-read` blue. The knob is a 12px circle at the playhead (seen at the start).
- Bottom row: duration `0:06` under the waveform start (secondary 13px), and the time `13.57` (plus ticks if outgoing) at the right of the waveform area.
- Right: 52px circular sender avatar. A 18px mic glyph overlaps its bottom-left edge: `--tick-read` blue when played, `--accent` green when unplayed.
- While playing, the avatar is replaced by a speed pill (`1×`, `1.5×`, `2×`; `--pill-bg`, 13px 600).
- Outgoing voice notes: same layout on `--bubble-out`. The played color is `--tick-read`, and unplayed bars are `rgba(255,255,255,0.4)`.

### 3.13 Call log card
```
┌────────────────────────────────────┐
│ ┌────────────────────────────────┐ │
│ │ (◉)  Missed voice call         │ │
│ │      Tap to call back    13.58 │ │
│ └────────────────────────────────┘ │
└────────────────────────────────────┘
```
- The outer bubble is the normal incoming/outgoing color with 4px padding. The inner panel is `--card-inner`, with radius 14px (mobile) / 6px (web) and a 1px `rgba(255,255,255,0.06)` border on mobile. Padding 12px 16px 10px 12px.
- Icon: 56px (mobile) / 36px (web) circle in `--icon-circle` with a 24px glyph:
  - Missed voice call: phone with ↙ arrow, `--danger`.
  - Missed video call: camera with ↙, `--danger`.
  - Incoming answered: ↙ + glyph, white. Outgoing: ↗ + glyph, white.
- Title (600): `Missed voice call`, `Missed video call`, `Voice call`, `Video call`.
- Subtitle (secondary): `Tap to call back` (mobile) / `Click to call back` (web) for missed calls; duration for answered ones (`55 min`, `8 min`, `19 min`); `No answer` for unanswered outgoing calls.
- Time: bottom-right inside the inner panel on mobile (`00.07`). On web it's outside the panel, bottom-right of the outer bubble (`13:41`).
- Width hugs content: mobile ~ 210px for "Video call", ~ 260px for "Missed video call". Web cards are wider (~270px).
- Consecutive call cards follow the normal run rules (spacing 3px, tail on last only on mobile).

### 3.14 Deleted / edited
- Deleted: 🚫 icon 16px + italic secondary text `This message was deleted` (`You deleted this message` for outgoing), with the meta inline.
- Edited: `Edited` in secondary text placed before the time in the meta block.

### 3.15 Document, location, contact, poll
- Document: `--card-inner` row inside the bubble (radius 10/6px, padding 10px). It has a 40×48 file-type tile (PDF `#E2574C`, DOCX `#2A5699`, XLSX `#1E7145`, ZIP/other `#5F6368`) with the extension in white 10px 700, the filename (15px, 1-line ellipsis), and `2 pages · PDF · 1.2 MB` in secondary. The meta sits below it.
- Location: a 260×150 map image in the media position, a red pin in the center, and an optional place name / address under it.
- Contact: 40px avatar + name (16px 500), divider, and a centered `Message` / `View contact` action in `--accent`.
- Poll: question (600), "Select one or more" (secondary 13px), options with 20px hollow circles, option text, a vote count right-aligned and a thin progress bar (3px, `--accent`) under each option. The footer `View votes` is centered in `--accent` above a hairline.

### 3.16 Forward button
- Mobile: a 40px circle in `--fab-bg` with a white curved forward arrow. It's vertically centered beside media and link-preview bubbles, 12px outside the bubble edge (seen beside images, stickers and the tasteskill preview).
- Web: a 26px forward arrow icon without fill, `rgba(255,255,255,0.6)`, beside the bubble. Shown on media messages; always visible in the screenshots.

### 3.17 Scroll-to-bottom button
- Mobile: a 40px circle in `--fab-bg` with a chevron-down, 16px from the right and 16px above the composer.
- Web: 42px, same style, 20px from the right / bottom.
- An optional unread badge (`--badge-bg`) sits at the top-left.
- Appears once the user scrolls more than ~1 viewport up, with a fade/scale-in over 150ms.

### 3.18 Message hover menu (web)
On hover, a chevron-down appears in the bubble's top-right corner. It sits on a small gradient fading from the bubble color, so it doesn't cover the text. Clicking it opens a context menu: `--bg-input`, radius 12px, 8px padding, items 40px tall with 14.5px text and a hover color of `--bg-list-hover`. Next to the bubble, a small emoji-react button (😊 in a 28px circle `--fab-bg`) appears.

### 3.19 Mobile long-press
The message lifts with a scale of 1.03 while the background dims to `rgba(0,0,0,0.6)` with blur. A reaction bar (6 emoji + `＋`) appears in a 48px pill above the message, and an action list (Reply, Forward, Copy, Star, Delete…) appears below it, radius 14px.

### 3.20 Chat list row (web)
```
┌───────────────────────────────────────────────┐
│        DevsAndAi                         21:10│ community label (optional)
│ (av)   General                             🔕 │
│        ~Rakha Fikri joined via an invite link │
└───────────────────────────────────────────────┘
```
- 72px tall (88px with a community label). Padding 0 16px. Avatar 49px with a 15px gap.
- Line 1: name (16px, 1-line ellipsis) + time on the right (12px). Time is secondary by default and `--accent` when there are unread messages (`20:48`, `19:54`, `Friday`).
- Line 2: preview (14px secondary, 1-line ellipsis) + right-side status icons:
  - 🔕 bell-off when muted (18px, secondary).
  - Unread badge: `--badge-bg`, min 20px height, radius 10px, 12px 600 black text (`2`, `642`, `6`, `17`, `71`).
- Preview content rules:
  - Group: `~Sender: ` prefix (`~Axvara 2: 🖼 🔥 PRODUK…`).
  - Own last message: ticks first, then `You: ` in groups (`✓ You: 🗒 Sticker`, `✓✓ 🖼 Kurang ini lasing`).
  - Media types: icon + label (`🖼 Photo`, `🎥 Video`, `GIF`, `🗒 Sticker`, `🎤 0:06`).
  - Missed call: `--danger` phone-missed icon + `Missed voice call`.
- Community group avatar: a 49px rounded-square community tile (radius 12px, `--community-tile` with glyph), with the group's own 28px avatar overlapping at bottom-right and a 2px `--bg-panel` ring.
- The community label sits above the name (12.5px secondary, `DevsAndAi`, `WAAVIS`).
- States: hover `--bg-list-hover`, selected `--bg-list-active`, radius 12px with 8px horizontal inset (seen as a rounded highlight).

---

## 3B. Other WhatsApp UI patterns (not in the samples)

These come from general knowledge of WhatsApp rather than the screenshots. Use the same tokens as above.

### 3.21 Forwarded label
- A line above the content (below the sender header) in secondary 13px italic-free text: a small forward-arrow icon + `Forwarded`.
- If the message was forwarded 5+ times, it shows a double arrow + `Forwarded many times`.

### 3.22 Mentions
- In text, `@Name` renders in a link color: `--tick-read` blue in dark mode (`#53BDEB`) and `#027EB5` in light mode. It's 500 weight with no underline. Tapping it opens the contact.
- When you're mentioned, the chat list shows a `@` badge in a green circle before the unread badge.

### 3.23 Starred / pinned / kept
- Starred: a 12px ★ in secondary text inside the meta block, before the time.
- Pinned message bar: a 52px bar directly under the chat header (`--bg-header`, hairline bottom). It has a 📌 icon, a 2px vertical segment indicator on the left (one segment per pinned message, max 3), sender + text preview in one line, and an optional thumbnail on the right. The message itself shows a 📌 in its meta.
- Kept in chat (disappearing mode): a 🔖 in the meta.

### 3.24 Unread divider
A full-width band on first open: `N UNREAD MESSAGES` (13px 500, uppercase on Android, sentence case on iOS: `3 Unread Messages`). Dark: `rgba(255,255,255,0.06)` background and secondary text. Light: `rgba(255,255,255,0.7)`. 6px vertical padding. It isn't sticky.

### 3.25 Header subtitle states
Personal chats:
- `online`
- `last seen today at 21.04`
- `typing…` in `--accent`
- `recording audio…` in `--accent`
- `click here for contact info` (web, shown briefly on open)

Group chats:
- The member list (as in the samples), or `~Name is typing…` in `--accent`.

### 3.26 Typing indicator (in-list)
An incoming-colored bubble (min-width 64px, height 36px) at the bottom, with three 8px dots in `--text-secondary`. The dots bounce in sequence (opacity 0.4 → 1, translateY −3px, 1.2s loop, 0.15s stagger).

### 3.27 Long message "Read more"
Text over ~700 characters (mobile) / ~3000 (web) is truncated after ~22 lines. A `Read more` link in `--tick-read` blue (500) follows the ellipsis and expands the text inline.

### 3.28 View once
- Unopened: a bubble with a 24px dashed-circle "1" icon in `--accent` + `Photo` / `Video` / `Voice message` (15px 500).
- Opened: grey icon + `Opened`, secondary text.

### 3.29 Round video message (video note)
- Circle 240px (mobile) / 200px (web), no bubble, `object-fit: cover`.
- Time pill below it, like stickers.
- Duration badge overlay bottom-center. A progress ring (3px, white 80%) runs around the circle while playing.

### 3.30 Album / grouped media
- Up to 4 tiles in a 2×2 grid with 2px gaps, total width ~ 300px.
- With more than 4 items, the 4th tile shows `+N` (28px 400 white) on a `rgba(0,0,0,0.5)` overlay.
- One shared caption-less time is shown on the last tile.

### 3.31 Event message
- Card with a 48px date tile: a month label (red, 11px 700) over a day number (22px 600).
- Event title (16px 600), date/time line (secondary), optional location row, and a `Join` / `Going` action row in `--accent` centered under a hairline.

### 3.32 Disappearing messages and E2E notices
- System pill with a ⏱ (timer) icon: `You turned on disappearing messages. New messages will disappear from this chat 7 days after they're sent.`
- First-message E2E notice: yellow-tinted pill with 🔒 (dark: `#FFD279` text on `#1D1F1F`; light: `#54656F` text on `#FFEECD`). Text: `Messages and calls are end-to-end encrypted. Only people in this chat can read, listen to, or share them. Learn more` (`Learn more` in the link color).

### 3.33 Business / verified / channel
- A verified badge (blue `#1DA1F2`-like or green scalloped ✓, 16px) after the name in the header, chat list and profile. Meta Verified uses a blue scalloped badge.
- Business chat header subtitle: `Business account`. Catalog, quick-reply buttons render below the bubble as 40px full-width bubble-colored buttons with `--tick-read` text (15px 500), separated by 1px hairlines.
- Announcement group / admins-only: the composer is replaced by a centered secondary text bar: `Only admins can send messages`.
- Left group: `You can't send messages to this group because you're no longer a member.`
- Blocked contact: composer replaced by `You blocked this contact. Tap to unblock.`

### 3.34 Status reply quote
A reply block like §3.10 whose first line is `Name · Status` (status in secondary). It has a thumbnail of the status on the right (or a colored text-status tile showing the first word).

### 3.35 Composer states
- Typing: the camera icon hides, the mic becomes a send button (➤), and the input grows up to 6 lines (then scrolls). Radius stays 18px; the pill becomes a rounded rect.
- Replying: a quote preview (§3.10 style, but `--bg-input` with a ✕ on the right) docks above the input inside the composer container, with a 4px radius join.
- Recording voice (mobile): the input row is replaced by a red pulsing mic dot + timer `0:12` + `‹ Slide to cancel` (secondary, with a shimmering animation). Sliding up locks the recording and shows 🗑 ⏸ and a send button.
- Attach menu (mobile `+` / web 📎): a sheet/popover listing Document (purple `#7F66FF`), Photos & videos (blue `#007BFC`), Camera (pink `#FF2E74`), Audio (orange `#FA6533`), Contact (blue `#009DE2`), Poll (yellow `#FFBC38`), Event (pink), New sticker (green). Each has a 48–54px colored circle icon and a 13px label. On web it's a vertical menu with 20px colored icons.
- Emoji panel (web): opens above the composer (~320px tall). Tabs are Emoji / GIF / Stickers, with category icons at the top and a search field. Emoji are 32px cells.

### 3.36 Selection mode
On mobile, tapping "Select" puts 22px circular checkboxes to the left of every message, and the header changes to `N selected` with Cancel. Selected messages get a full-row tint `rgba(33,192,99,0.15)`. The bottom bar shows Star / Forward / Share / Delete.

### 3.37 Search in chat
- Mobile: the header becomes a search field.
- Web: a 360px right panel titled `Search messages`, with results showing date, sender, and a snippet with the match in bold.
- In the list, matching words are highlighted with a `rgba(255,214,0,0.35)` background (yellow in light mode `#FFF5AB`).
- Up/down arrows step through results.

### 3.38 Contact / group info screen
- Large 120px (web 200px) avatar, name 24px 500, phone or `Group · 42 members` in secondary.
- An action row of 4 tiles (Audio / Video / Search / More, or Add for groups). Each tile is 64×64 in `--bg-input`, radius 12px, with an `--accent` icon and a 13px label.
- Sections are separated by 8px `--bg-chat` gaps: About, Media links and docs (horizontal strip of 80px thumbs + count), Starred, Mute, Disappearing messages, Encryption, member list (avatar, name, about line, `Group admin` chip in `--accent` text on `rgba(33,192,99,0.15)`), then destructive actions in `--danger` (Exit group, Report).

### 3.39 Image lightbox
- Black overlay. The header has back, sender avatar + name, date/time, and star / reply / forward / ⋮ actions.
- The image is centered with pinch zoom. The caption sits at the bottom on a gradient.
- A thumbnail strip at the bottom (web) or swipe between media (mobile).
- Web: ←/→ arrow buttons as 48px circles at `rgba(255,255,255,0.1)`.

### 3.40 Edge spacing quirks
- After a date pill, the first bubble of the day always starts a new run, even if it's the same sender as the last message of the previous day.
- System messages also break runs.
- Outgoing messages in groups never show the sender header or avatar.
- On mobile, outgoing tails are at the bottom-right. On web, they're at the top-right.
- A meta that ends with ticks gets 2px more right padding.
- Bubbles containing only a URL with no preview are normal text bubbles; the link is underlined in `--accent`.

---

## 4. Motion

| Interaction | Animation |
|---|---|
| Hover color changes | 120ms ease |
| Scroll-to-bottom appear/disappear | 150ms fade + scale 0.8 → 1 |
| Sticky date pill | 200ms fade, hides ~1.5s after scrolling stops |
| Jump-to-message highlight | Overlay 0.08 white, fade out over 1.5s |
| Menus / popovers | 150ms fade + translateY(4px → 0) |
| Mobile screen push | 300ms iOS slide (chat list → chat) |
| New message arrives at bottom | 200ms translateY(8px → 0) + fade |
| Voice-note playhead | Linear, synced to audio |

Respect `prefers-reduced-motion` by replacing transforms with plain fades and disabling the highlight pulse.

---

## 5. Accessibility

- Text contrast is at least 4.5:1 on bubbles. Check `--text-secondary` on `--bubble-out` and raise it to 0.65 opacity if it falls short.
- Color is never the only signal: missed calls also say "Missed", and sender colors always come with the name.
- The message list is `role="log"`. Each bubble is labeled `"<Sender>, <time>: <text>"`. Date pills are `role="separator"`.
- All icon buttons get `aria-label`s (Back, Video call, Voice call, Search, More options, Attach, Emoji, Camera, Record voice message, Scroll to bottom, Forward).
- Focus ring: 2px `--accent` outline with a 2px offset.
- The voice-note seek control is a slider with `aria-valuetext` (`0:03 of 0:06`).
- Use `rem`-based type so OS/browser font scaling works. The layout must survive 200% zoom.

---

## 6. Assets checklist

- Bubble tail SVGs: mobile in/out (bottom swoosh), web in/out (top nub).
- Doodle wallpaper tile (original artwork, not WhatsApp's), SVG, ~400×400, single stroke color.
- Icon set listed in §1.5.
- Read-tick SVGs: single and double, 16×11.
- Call glyphs: phone ↙ / ↗, video ↙ / ↗, missed variants.
- Community tile glyph.
- File-type tiles: PDF, DOC, XLS, PPT, ZIP, generic.

> Branding: the WhatsApp name, logo and wallpaper are trademarked/copyrighted. Recreate the visual style, but use original artwork and naming in anything you ship.
