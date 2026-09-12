# Helios — Interactive Solar System

An offline interactive WebGL wallpaper for Wallpaper Engine. English is the default interface language; Russian, German and Spanish remain available from the language button and Wallpaper Engine properties.

## Controls

- **Orbits:** drag with LMB to rotate the camera; click a celestial body to open its dossier.
- **In order:** fixed side view; click a body to explore it.
- **Dossier:** drag the body with LMB or select glowing research points, moons and spacecraft. The complete dossier is arranged on one screen without scrolling.
- LMB rotation can be disabled from the top bar or Wallpaper Engine properties.
- `Esc` returns to the map, `←` / `→` selects the adjacent body and `Space` toggles simulated time.

Mouse-wheel zoom is intentionally disabled.

## Model accuracy

Positions of the eight planets are calculated for the selected date from mean J2000 orbital elements with secular corrections and a numerical Kepler-equation solution. The model is intended for educational visualization between **1800 and 2050** and must not be used for spacecraft navigation.

Planet sizes are enlarged on the system map. The Scenic scale compresses orbital radii non-linearly, while the AU scale keeps distances proportional to astronomical units with a slightly expanded inner region for readability.

Research-mode moon and spacecraft orbits are schematic and visually compressed. Natural satellites use representative mean orbital elements; spacecraft use characteristic mission trajectories because their real elements change over time.

## Visual sources

The Sun and planets use local scientific global maps derived from NASA, USGS, NASA SVS and Hubble OPAL data. Earth uses a Blue Marble-derived surface with a separate dynamic cloud layer and atmosphere. Venus is displayed in natural visible-light cloud colors rather than Magellan radar false colors.

Detailed source attribution is available in `assets/CREDITS.txt`. The bundled Three.js license is included in `THIRD_PARTY_LICENSES.txt`.

## Wallpaper Engine properties

Users can configure the map mode, distance scale, simulation speed, mouse rotation, planet opening, labels, orbits, automatic high-resolution interface scaling, a separate text-size scale, interface color, quality, FPS, clocks, timer, audio visualizers and gravity fabric.

## Release

- Author: **CK.product**
- Project type: offline web wallpaper
- Default language: **English**
- Additional languages: Russian, German and Spanish
- Recommended Workshop genre: **Sci-Fi**
- Recommended age rating: **Everyone**

See `README_RU.md` for Russian documentation and `WORKSHOP.md` for the publishing checklist.
