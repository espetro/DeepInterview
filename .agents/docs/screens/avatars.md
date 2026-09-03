# Screen: Avatars (`/avatars`)

## ASCII mockup (current state)

```
+------------------------------------------------------------------+
|  [logo]                               Prep          (nav)        |
+------------------------------------------------------------------+
|  Choose your interviewer avatar                                  |
|                                                                  |
|  +----------+  +----------+  +----------+  +----------+          |
|  | avatar 1 |  | avatar 2 |  | avatar 3 |  | avatar 4 |          |
|  |  (o)     |  |  (o)     |  |  (o)     |  |  (o)     |          |
|  |  name    |  |  name    |  |  name    |  |  name    |          |
|  +----------+  +----------+  +----------+  +----------+          |
|                                                                  |
|  +------------------------------------------------------------+ |
|  | AVATAR STAGE (live preview of selected avatar)             | |
|  |      o                                                     | |
|  |     /|\   idle / speaking animation                        | |
|  |     / \                                                    | |
|  +------------------------------------------------------------+ |
|                                                                  |
|             [ <- Back to home ]   =>  /                          |
+------------------------------------------------------------------+
```

## Section inventory

- Header nav.
- AvatarGallery: grid of selectable avatars.
- AvatarStage: live preview / animation of the selected avatar.
- Back link.

## Primary CTAs

- Select an avatar (updates preview).
- **Back to home** -> `/`.

## States

- Gallery: browsing / selected.
- Stage: idle / speaking animation.
- Load failure: placeholder tiles.

## Nav links

- `/` (back), header nav (`/prep`).

## Key files

- `apps/web/app/avatars/page.tsx` - route
- `apps/web/components/avatar/avatar-gallery.tsx`
- `apps/web/components/avatar/avatar-stage.tsx`
