# Design Guidelines: Voice-to-Text AI Application

## Design Approach

**Selected Approach:** Reference-Based with Modern AI Product Inspiration

Drawing from Linear's precision typography, Notion's approachable interactions, and modern AI products' sophisticated minimalism. The design emphasizes clarity, trust, and technological sophistication while maintaining warmth and accessibility.

**Core Principles:**
- Clean, spacious layouts that let content breathe
- Subtle sophistication over flashy effects
- Trust-building through professional polish
- Instant clarity of value proposition

---

## Typography System

**Font Stack:** 
- Primary: Inter (via Google Fonts CDN) - for UI and body text
- Display: Inter with tighter tracking for headlines

**Hierarchy:**
- Hero headline: text-6xl md:text-7xl lg:text-8xl, font-bold, tracking-tight, leading-tight
- Section headlines: text-4xl md:text-5xl, font-bold, tracking-tight
- Subsection titles: text-2xl md:text-3xl, font-semibold
- Feature titles: text-xl md:text-2xl, font-semibold
- Body text: text-base md:text-lg, font-normal, leading-relaxed
- Small text/captions: text-sm, font-medium
- CTAs: text-base md:text-lg, font-semibold

---

## Layout System

**Spacing Primitives:** Use Tailwind units of 2, 4, 6, 8, 12, 16, 20, 24, 32

**Container Strategy:**
- Full-width sections with inner max-w-7xl for content
- Hero section: max-w-6xl for centered content
- Feature grids: max-w-7xl
- Text-heavy sections: max-w-4xl

**Vertical Rhythm:**
- Section padding: py-20 md:py-32 for major sections
- Component spacing: space-y-12 md:space-y-16 between major elements
- Card/feature spacing: gap-8 md:gap-12 in grids
- Inline spacing: space-y-4 for related elements

**Grid System:**
- Use cases grid: grid-cols-1 md:grid-cols-2 lg:grid-cols-4
- Feature grid: grid-cols-1 md:grid-cols-2 lg:grid-cols-3
- Testimonials: grid-cols-1 md:grid-cols-2 lg:grid-cols-3
- Blog posts: grid-cols-1 md:grid-cols-2 lg:grid-cols-4

---

## Component Library

### Navigation
**Header:** Fixed top navigation with backdrop blur (backdrop-blur-md, bg-opacity-90)
- Logo left, navigation center, CTA buttons right
- Height: h-16 md:h-20
- Padding: px-6 md:px-8
- Navigation links spaced with gap-8

### Hero Section
**Layout:** Centered content with demo widget
- Height: min-h-screen with proper vertical centering
- Headline with rotating words animation (message/note/email/post/journal)
- Subheadline below with engaging copy
- Primary CTA + Secondary CTA (gap-4)
- Trust indicator (user count + avatars)
- Demo recording widget centered below CTAs

### Voice Recording Demo Widget
**Interactive Component:**
- Rounded container with border and subtle shadow
- Waveform visualization area (h-24 to h-32)
- Large circular record button (w-16 h-16 md:w-20 h-20)
- Timer display
- Microphone icon from Heroicons
- States: idle, recording (pulsing animation), processing, complete

### How It Works Section
**3-Step Visual Flow:**
- Horizontal layout on desktop, vertical on mobile
- Each step: Icon/illustration + title + description
- Connected with arrow indicators (desktop only)
- Step cards with padding p-8, rounded-2xl

### Use Cases Section
**Grid Layout:**
- 4 major use cases (Note-taking, Communication, Content Creation, Journaling)
- Each card: Title, bullet points, description, illustration
- Cards with hover effect (slight scale, shadow increase)
- Padding: p-8 md:p-10

### Rewrite Options Showcase
**Horizontal Scrollable Cards:**
- Display 5-6 rewrite options as cards
- Each card: Icon/emoji, title, description
- Scrollable on mobile (snap-x), grid on desktop
- Card size: min-w-64 md:min-w-72

### Feature Grid
**Comprehensive Features:**
- 8-10 features in 3-column grid (desktop)
- Each feature: Icon, title, brief description
- Icons from Heroicons (consistent size w-8 h-8)
- Compact spacing for density

### Testimonials Section
**Grid of Review Cards:**
- 6-9 testimonials in 3-column grid
- Each card: Avatar, name, source icon, quote, rating
- Avatars: w-12 h-12, rounded-full
- Source icons (Twitter, App Store, Product Hunt) w-5 h-5
- Card padding: p-6, rounded-xl

### Blog Preview Section
**4-Column Grid:**
- Featured blog posts with images
- Each card: Image (aspect-video), title, date
- Image with rounded-t-xl, card with rounded-xl
- Hover: subtle shadow and transform

### Final CTA Section
**Centered Conversion:**
- Large headline
- Engaging subheadline
- Primary CTA button (prominent)
- Background treatment (gradient or pattern)
- Padding: py-24 md:py-32

### Footer
**Comprehensive Footer:**
- 4-column layout on desktop, stacked on mobile
- Sections: Product, Resources, Download, Contact
- Social media icons (gap-4)
- Newsletter signup field with button
- Copyright and legal links
- Generous padding: pt-16 pb-8

---

## Animations & Interactions

**Minimal, Purposeful Animations:**
- Recording button: gentle pulse during recording
- Waveform: real-time audio visualization
- Card hovers: transform scale-105, duration-300
- Page transitions: opacity and slight translate
- CTA buttons: no additional animations (rely on native hover states)

**NO Animations for:**
- Scroll-triggered effects
- Parallax
- Complex page transitions
- Background animations

---

## Images Section

### Required Images and Placement:

**Hero Section:**
- Large hero image/illustration showing the app interface on multiple devices (phone, tablet, desktop)
- Position: Below the CTA buttons, centered
- Aspect ratio: 16:9 or wider
- Treatment: Subtle shadow, slight perspective tilt for depth

**Use Case Sections:**
- 4 images showing the app in different contexts:
  - Note-taking: App with bullet points and organized notes
  - Communication: Email/message composition interface
  - Content Creation: Social media post being created
  - Journaling: Daily journal entry interface
- Each image: aspect ratio 4:3, rounded corners
- Position: Right side of card on desktop, above text on mobile

**Testimonial Avatars:**
- User profile photos (9 images)
- Size: 48x48px, circular crop

**Blog Preview Images:**
- 4 featured article images
- Aspect ratio: 16:9
- Treatment: Rounded corners, subtle hover shadow

**Trust Indicators:**
- Small user avatars for "Trusted by 100,000 users" (5-6 overlapping avatars)
- Platform icons (iOS, Android, macOS, Web)

**Feature Icons:**
- Use Heroicons for all feature icons (no custom images needed)

---

## Technical Specifications

**Icons:** Heroicons via CDN (outline style for most, solid for emphasis)

**Fonts:** Inter from Google Fonts
```
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
```

**Responsive Breakpoints:**
- Mobile: base (< 768px)
- Tablet: md (≥ 768px)
- Desktop: lg (≥ 1024px)
- Wide: xl (≥ 1280px)