# Ember's Bus 🚌

A gentle, touch-friendly bus game made for Ember, who loves buses and carries
pictures of her family and friends everywhere. Put the people you love on the
bus, buckle them in, beep the horn, and drive!

It runs in any modern browser on an iPad, phone, or laptop. There is nothing to
install and no build step: it is one HTML page with plain CSS and JavaScript.

## What you can do

**Outside the bus**
- 🚪 **Open the door** (tap the door on the bus, or the Open button) to go inside.
- 📣 **Beep the horn** (tap the roof of the bus, or the Horn button).
- 👉 **Push the bus**: drag the bus (or swipe anywhere) in the direction you
  want it to go. If that is the way it is facing it drives off; if it is the
  other way it spins round first, then drives. The wheels turn, the scenery
  rolls past, and the passengers wobble.
- ▶️ **Go / Stop** buttons do the same without gestures.
- 🚏 **Bus stop**: the bus pulls up at a zebra crossing and your friends wait to
  cross. Drag each person up across the road to the other side. The bus will not
  go while somebody is still on the road!
- 🧽 **Wash the bus**: the bus gets muddy as it drives. Rub it with the sponge to
  pop the mud away and make it sparkle.
- 🌧️ **Wipers**: rain starts and the windscreen wiper swishes.
- 💡 **Lights**: night falls and the headlights come on.
- 🎵 **Music**: pick a song (The Wheels on the Bus, Twinkle Twinkle, Old
  MacDonald, London Bridge). Each plays on a little synth with a drum beat and
  bass line.
- 🎨 **Colour**: choose from twelve bus colours.
- 🔄 **Turn**: the bus spins round so you can see the people sitting on the
  other side. Facing right you see the door side (the left-hand pair of seats
  in each row); facing left you see the right-hand pair. Row 1 is nearest the
  front. The driver shows in the windscreen either way.

**Inside the bus**
- A top-down plan of the bus: door at the front left, driver at the front
  right, and four rows of two-plus-two seats. Drag a person from the tray onto
  any seat. Drop someone on the seat marked **Driver** (front right, by the
  steering wheel) to make them the driver.
- Tap a seated person to click the seat belt on. Tap again to take it off.
- Drag a person off a seat to let them off the bus.
- Close the door to go back outside. The people you seated appear in the bus
  windows.

**Adding people**
- Inside the bus tap ➕ and choose a photo. Drag the photo so the face sits in
  the circle, and pinch (or use the slider, or the mouse wheel) to zoom in on
  it. Type a name and Save. Only the small circle you chose is kept, in the
  browser on that device. Nothing is uploaded anywhere.
- Tap ✏️ to edit or remove people.

Everything (people, seats, seat belts, bus colour) is remembered on the device,
so the bus is exactly how she left it next time.

**Sharing the family between devices**
- Tap ✏️ then 📤 to save a `people.json` file with everyone in it.
- Put that file in the game folder (the root of this repository, next to
  `index.html`) and push it. From then on every device loads those people
  automatically the first time it opens the game.
- Or tap ✏️ then 📥 on another device and choose the file to load them in.
- Someone you delete on a device stays deleted there, even if they are in the
  shared file.

## Playing it

**Play it here:** https://iannaylor.github.io/Embers-Bus/

Every push to the repository runs the GitHub Actions workflow in
`.github/workflows/pages.yml`, which publishes the game to GitHub Pages at that
address. On an iPad or iPhone open it in Safari and use *Share → Add to Home
Screen* to get a full-screen app icon.

If the workflow ever fails with a Pages permission error, enable Pages once by
hand: repository *Settings → Pages → Source: GitHub Actions*, then re-run the
workflow.

Other ways to run it:

1. Open `index.html` straight from the folder in a browser. Everything works
   from a plain file.
2. Serve it from a laptop on the same Wi-Fi:

   ```sh
   cd Embers-Bus
   python3 -m http.server 8000
   ```

   then open `http://<laptop-ip>:8000/` on the iPad.

Once it has loaded over HTTP it also works offline thanks to the small service
worker.

## Tips for grown-ups
- Sound uses the device's Web Audio synth, so no sound files are needed. iOS
  needs the first tap before it will make any noise, and the ringer switch
  must not be on silent.
- Keyboard on a laptop: `→` drive right, `←` drive left (turning if needed), space stop, `H` horn, `W` wipers,
  `L` lights, `M` music, `T` turn round, `Enter` open the door, `Esc` close it.
- Photos are stored in the browser's localStorage. Clearing site data will
  remove them, so keep the originals.

## Files
- `index.html` — the page and the bus drawing (SVG)
- `css/style.css` — layout, colours and animations
- `js/app.js` — game logic (scenes, drag and drop, driving, washing, crossing)
- `js/audio.js` — synthesised sounds and the tune
- `js/store.js` — saving people and seats, resizing photos
- `sw.js`, `manifest.webmanifest`, `icon.svg` — offline / home screen support
