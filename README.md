# HARMONIC SERIES ONLINE SYNTHESIZER

## Overview
An online visual synthesizer that demonstrates the Harmonic Series by allowing users to add harmonics and tweak their volumes. This was made for a school project related to Music Technology, and my purpose for this project was to show people how different harmonic series overtone settings and volumes change the overall texture of a sound. Users can also play a MIDI file or upload their own, and hear how the MIDI sounds with their harmonic preset.

## How to Run
The web app is hosted online via GitHub pages. Click here to play: https://harmonicseries.diegojmejia.com/

## Features
### Harmonic Series
- Add/Remove rows of overtones and change their volume
- Select a harmonic preset (such as "Church Organ") that will automatically add/remove rows and adjust their volumes
### Audio
- Visualize the current waveform being played, using Fourier Synthesis
- Adjust the Attack, Release, Transpose (in semitones and cents)
### MIDI
- Play a virtual piano keyboard using the computer keyboard and also toggle Sustain, Octave, Velocity, and Pitch Bend
- Connect an external MIDI device to play
- Select a preset MIDI file or upload your own MIDI file.
- Play the MIDI file and also toggle looping and adjust the speed or playback postiion

## Tech Stack
- Languages and Frameworks: HTML, CSS, JavaScript (Node.js), Vite
- Libraries and APIs: @tonejs/midi, midi-file
