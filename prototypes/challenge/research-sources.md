# Research Sources and Mapping

This prototype set uses the `design-principles.md` summaries plus direct web research.  
Each company theme in `prototypes/<company>/theme.css` maps back to the sources below.

## Company Sources

1. Apple
- Apple Developer: https://developer.apple.com/design/
- WWDC23 Animate with Springs: https://developer.apple.com/videos/play/wwdc2023/10158/

2. Google
- Material tokens (motion): https://github.com/material-foundation/material-tokens/blob/json/json/motion.json
- Android motion guidance: https://developer.android.com/develop/ui/views/animations/reposition-view

3. Microsoft
- Fluent 2 Motion: https://fluent2.microsoft.design/motion
- Windows timing/easing: https://learn.microsoft.com/en-us/windows/apps/design/motion/timing-and-easing

4. Meta
- React Native animations: https://reactnative.dev/docs/animations
- Reanimated docs: https://docs.swmansion.com/react-native-reanimated/

5. Amazon
- Cloudscape foundation: https://cloudscape.design/foundation/
- AWS Amplify UI docs: https://docs.amplify.aws/react/build-ui/
- Prime Video UI update article: https://variety.com/2024/digital/news/amazon-prime-video-interface-update-whats-new-1236081109/

6. Netflix
- Hawkins article mirror (source text): https://www.engineering.fyi/article/hawkins-diving-into-the-reasoning-behind-our-design-system

7. Spotify
- Reimagining design systems at Spotify: https://spotify.design/article/reimagining-design-systems-at-spotify
- Encore three years on: https://spotify.design/article/can-i-get-an-encore-spotifys-design-system-three-years-on

8. Airbnb
- Design at Airbnb: https://airbnb.design/building-a-visual-language/
- Introducing Lottie: https://airbnb.design/introducing-lottie/

9. Linear
- Feature/design quality language: https://linear.app/features/level-up
- Product quality statement: https://linear.app/the-method/design
- Principles overview: https://linear.app/the-method/product

10. Stripe
- Stripe Apps design guidelines: https://docs.stripe.com/stripe-apps/ui-components
- Stripe app design docs: https://stripe.com/docs/stripe-apps/design

11. Disney
- UI adaptation of Disney principles: https://www.interaction-design.org/literature/article/ui-animation-how-to-apply-disney-s-12-principles-of-animation-to-ui-design
- Design principles discussion: https://uxdesign.cc/disneys-12-principles-of-animation-exemplified-in-ux-design-5cc7e3dc3f75

## Mapping to Implementation

- Shared product behavior (`prototypes/common/app.js`, `prototypes/common/profile.js`):
  - Intake validation + user feedback states
  - Right-side activity log drawer
  - Site analytics and social analytics blocks
  - Profile pages for downloaded users

- Theme mappings (`prototypes/<company>/theme.css`):
  - Color systems, elevation, and shape language
  - Motion/easing emphasis per company
  - Surface material treatment (glass/acrylic/dense/dark/editorial)
  - Distinct accent behavior (hover zoom, pulse, token pills, cinematic depth)

- Choreography mappings (`prototypes/<company>/theme.js` + `prototypes/<company>/app.js`):
  - `entry`: per-company entrance sequencing (`spring`, `axisX`, `fade`, `minimal`, `cinematic`)
  - `drawer`: activity panel behavior (`slide`, `sheet`, `fade`, `elastic`, `instant`)
  - `hover`: media hover response (`lift`, `zoom`, `pulse`, `subtle`)
  - `capture`: intake completion feedback (`flash`, `snap`, `ripple`, `bounce`, `flourish`)
