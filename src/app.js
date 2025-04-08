import { parseMidi } from 'midi-file';
import { Midi } from "@tonejs/midi";

let midiAccess;
let audioContext;
let compressor;
let activeNotes = {};
let sustainedNotes = {};
let releasingNotes = {};
let sustainOn = false;

let masterGain = 0.66;
let attack = 0.001
let release = 0.001
let transposeSemi = 0;
let transposeCent = 0;
let bendFactor = 1;
let maxNotes = 25;
let normalizeSmoothness = 0.015

let harmonicSettings = [
    { attack: attack, release: release},
    { volume: 1 }
];

let harmonicPresets = {};
let harmonicsContainer;
let harmonicRow;
let addButton;
let removeButton;
let transposeSemiSlider;
let transposeCentSlider;
let attackSlider;
let releaseSlider;
let attackValueLabel;
let releaseValueLabel;
let transposeSemiValueLabel;
let transposeCentValueLabel;

let waveformGraph;
let waveformGraphCSS;
let waveformCtx;
let referenceFrequency = 27.5;

document.addEventListener('DOMContentLoaded', async () => {
    await loadHarmonicPresets();
    initAudio();
    initMIDI();
    initHarmonicsGUI();
    initWaveformGraph();
    await initMIDIPlayer();
    initPiano();
});

//---------------HARMONIC PRESETS------------------ //


async function loadHarmonicPresets() {
    try {
        const response = await fetch('harmonic-presets.json');

        if (!response.ok) {
            throw new Error(`HTTP Error! Status: ${response.status}`);
        }
        harmonicPresets = await response.json();

        createHarmonicPresetMenu();

    }
    catch (error) {
        console.error("Error loading presets: ", error);
        document.getElementById('harmonic-presets-container').innerHTML += 
        '<p class="error">Failed to load presets</p>';
        return false;
    }
}

function createHarmonicPresetMenu() {
    const presetDropdown = document.getElementById('harmonic-presets-dropdown');
    while (presetDropdown.options.length > 1) {
        presetDropdown.remove(1);
    }
    
    for (const category in harmonicPresets) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = category;

        for (const preset in harmonicPresets[category]) {
            const option = document.createElement('option');
            option.value = JSON.stringify(harmonicPresets[category][preset]);
            option.textContent = preset;
            optgroup.appendChild(option);
        }
        presetDropdown.appendChild(optgroup);
    }

    presetDropdown.addEventListener('change', function() {
        if (this.selectedIndex !== 0) {
            try {

                const presetSettings = JSON.parse(JSON.stringify(JSON.parse(this.value)))
                harmonicSettings = presetSettings;

                updateHarmonicGUI();
                updateActiveNotes();
            }
            catch {
                console.error('Invalid preset selection:', error);
            }
        }
    });
}


//---------------HARMONIC GUI------------------ //


function initHarmonicsGUI() {
    addButton = document.getElementById('harmonic-add');
    removeButton = document.getElementById('harmonic-remove');
    attackSlider = document.getElementById('harmonic-attack-slider');
    releaseSlider = document.getElementById('harmonic-release-slider');
    transposeSemiSlider = document.getElementById('transpose-semitones-slider');
    transposeCentSlider = document.getElementById('transpose-cents-slider');
    attackValueLabel = document.getElementById('harmonic-attack-value-label');
    releaseValueLabel = document.getElementById('harmonic-release-value-label');
    transposeSemiValueLabel = document.getElementById('transpose-semitones-value-label');
    transposeCentValueLabel = document.getElementById('transpose-cents-value-label');
    
    
    harmonicRow = document.getElementById('harmonic-row');
    harmonicsContainer = document.getElementById('harmonics-container');

    harmonicsContainer.innerHTML = '';

    updateHarmonicGUI();

    addButton.addEventListener('click', () => {
        addHarmonic();
    });

    removeButton.addEventListener('click', () => {
        removeHarmonic();
    });

    attackSlider.addEventListener('input', function() {
        attack = parseFloat(this.value);
        attackValueLabel.innerHTML = this.value;
    });

    releaseSlider.addEventListener('input', function() {
        release = parseFloat(this.value);
        releaseValueLabel.innerHTML = this.value;
    });
    transposeSemiSlider.addEventListener('input', function() {
        transposeSemi = parseInt(this.value);
        transposeSemiValueLabel.innerHTML = parseInt(this.value);
        updateCurrentTranspose()
    });
    transposeCentSlider.addEventListener('input', function() {
        transposeCent = parseInt(this.value);
        transposeCentValueLabel.innerHTML = parseInt(this.value);
        updateCurrentTranspose()
    });
}

function updateCurrentTranspose() {
    const allNotes = {...activeNotes, ...sustainedNotes, ...releasingNotes};

    for (const noteKey in allNotes) {
        const note = allNotes[noteKey];
        if (note.oscillators) {
            note.oscillators.forEach(({ oscillator, gainNode, baseFrequency}) => {
                const totalCents = (transposeSemi * 100) + transposeCent;
                const centMultiplier = Math.pow(2, totalCents/1200);
                baseFrequency *= centMultiplier
                oscillator.frequency.value = baseFrequency;
            });
        }
    }
}

function addHarmonic() {
    if (harmonicSettings.slice(1).length < 50) {
        harmonicSettings.push({ volume: 1 });
        updateHarmonicRows();
        updateActiveNotes();
    }
}

function removeHarmonic() {
    if (harmonicSettings.slice(1).length > 1) {
        harmonicSettings.pop();
        updateHarmonicRows();
        updateActiveNotes();
    }
}

function updateHarmonicGUI() {
    harmonicsContainer.innerHTML = ''

    if (harmonicSettings.length > 0 && harmonicSettings[0]) {
        if (harmonicSettings[0].attack !== undefined) {
            attack = parseFloat(harmonicSettings[0].attack);
            attackSlider.value = attack.toString();
            attackValueLabel.innerHTML = attack.toString();
        }
        
        if (harmonicSettings[0].release !== undefined) {
            release = parseFloat(harmonicSettings[0].release);
            releaseSlider.value = release.toString();
            releaseValueLabel.innerHTML = release.toString();
        }
    }
    
    updateHarmonicRows();
}

function updateHarmonicRows() {

    harmonicsContainer.innerHTML = ''

    harmonicSettings.forEach((setting, index) => {
        if (index !== 0) {
            const clone = document.importNode(harmonicRow.content, true);
            const label = clone.querySelector('.harmonic-label');

            if (label) {
                label.innerHTML = `${index}`
            }

            const volumeSlider = clone.querySelector('.harmonic-volume-slider');

            if (volumeSlider) {
                volumeSlider.value = setting.volume;
                volumeSlider.dataset.index = index;

                volumeSlider.addEventListener('input', function() {
                    const index = parseInt(this.dataset.index);
                    harmonicSettings[index].volume = this.value;
                    updateActiveNotes();
                });
            }
            harmonicsContainer.appendChild(clone);
        }
    });
}

//---------------UPDATE ACTIVE NOTES------------------ //


function updateActiveNotes() {
    if (Object.keys(activeNotes).length === 0 && Object.keys(sustainedNotes).length === 0) return;

    let totalEnergy = 0;

    for (let i = 0; i < harmonicSettings.slice(1).length; i++) {
        const volume = parseFloat(harmonicSettings.slice(1)[i].volume);
        totalEnergy += volume * volume;
    }
    
    const normalizationFactor = totalEnergy > 0 ? 1 / Math.sqrt(totalEnergy) : 0;

    function updateNoteOscillators(note) {
        const {oscillators, gainNode} = note
        const baseFrequency = oscillators[0].oscillator.frequency.value

        for (let i = 0; i < Math.min(oscillators.length, harmonicSettings.slice(1).length); i++) {
            const volume = parseFloat(harmonicSettings.slice(1)[i].volume);
            oscillators[i].gainNode.gain.value = volume * normalizationFactor;
        }

        for (let i = oscillators.length; i < harmonicSettings.slice(1).length; i++) {

            const volume = parseFloat(harmonicSettings.slice(1)[i].volume);
            const now = audioContext.currentTime;

            const oscillator = audioContext.createOscillator();
            const frequency = baseFrequency * (i + 1);

            oscillator.type = 'sine';
            oscillator.frequency.value = frequency * bendFactor;
    
            const harmonicGain = audioContext.createGain();
            harmonicGain.gain.cancelScheduledValues(now);
            harmonicGain.gain.setValueAtTime(0, now);
            harmonicGain.gain.linearRampToValueAtTime(volume * normalizationFactor, now + attack);
            
            oscillator.connect(harmonicGain);
            harmonicGain.connect(gainNode);
            oscillator.start();
    
            oscillators.push({ oscillator: oscillator, gainNode: harmonicGain, baseFrequency: frequency });
        }

        if (oscillators.length > harmonicSettings.slice(1).length) {
            const now = audioContext.currentTime;
            for (let i = harmonicSettings.slice(1).length; i < oscillators.length; i++) {
                oscillators[i].oscillator.stop(now + release);
            }
            oscillators.length = harmonicSettings.slice(1).length
        }

        normalizeGains();

    }

    for (const note in activeNotes) {
        updateNoteOscillators(activeNotes[note]);
    }

    for (const note in sustainedNotes) {
        updateNoteOscillators(sustainedNotes[note]);
    }
}


//---------------MIDI FUNCTIONALITY------------------ //


function initAudio() {
    let resetAudioButton = document.getElementById('reset-audio');
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    document.addEventListener('click', () => {
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
    });

    resetAudioButton.addEventListener('click', () => {
        resetAudio()
    })
}

function resetAudio() {
    if (audioContext) {
        const allNotes = {...activeNotes, ...sustainedNotes, ...releasingNotes};

        for (const noteKey in allNotes) {
            const note = allNotes[noteKey];
            const now = audioContext.currentTime;
            if (note.oscillators) {
                note.oscillators.forEach(({ oscillator, gainNode }) => {
                    try {
                        oscillator.stop(now);
                        oscillator.disconnect();
                        gainNode.disconnect();
                    } catch (error) {
                        console.error('Error stopping oscillator:', error);
                    }
                });
            }
        }
        audioContext.close();
        
        initAudio()
        
    }
}

async function initMIDI() {
    const midiMessage = document.querySelector('.midi-message');

    if (!navigator.requestMIDIAccess) {
        midiMessage.textContent = "MIDI is not supported in this browser";
        return;
    }

    try {
        midiAccess = await navigator.requestMIDIAccess();
        midiAccess.onstatechange = onMIDIStateChanged;

        midiMessage.textContent = 'Waiting for MIDI Device...';

        onMIDIStateChanged();
    }
    catch (error) {
        midiMessage.textContent = `Failed to access to MIDI devices: ${error}`;
        console.error('MIDI Access Error:', error);
    }
}

function onMIDIStateChanged (event) {

    if (!midiAccess) return;

    const midiMessage = document.querySelector('.midi-message');
    const inputs = midiAccess.inputs;

    inputs.forEach(input => {
        input.onmidimessage = onMIDIMessage;
    });

    if (inputs.size > 0) {
        const deviceNames = [];
        inputs.forEach(input => deviceNames.push(input.name));
        
        midiMessage.textContent = `Connected to: ${deviceNames.join(', ')}`;
    } else {
        midiMessage.textContent = 'Waiting for MIDI device to connect...';
    }
}

function onMIDIMessage (input, midiPlayerActivated=false) {

    const command = input.data[0];
    const note = input.data[1];
    const velocity = input.data[2];

    const activeNotesMessage = document.querySelector('.active-notes-message')

    if (command === 144) {
        if (velocity > 0) {
            noteOn(note, velocity, midiPlayerActivated);
        }
        else {
            noteOff(note)
        }
    }
    if (command === 128) {
        noteOff(note);
    }
    if (command === 176) {
        onControlChange(note, velocity);
    }
    if (command === 224) {
        onPitchBend(velocity)
    }
    

    activeNotesMessage.textContent = JSON.stringify(Object.keys(activeNotes));

}

function normalizeGains() {
    const noteCount = Object.keys(activeNotes).length + Object.keys(sustainedNotes).length + Object.keys(releasingNotes).length;

    if (noteCount === 0) return;
    
    const scaleFactor = 1 / Math.sqrt(noteCount);
    const now = audioContext.currentTime;

    for (const note in activeNotes) {
        const { oscillators, gainNode, velocity } = activeNotes[note];
        const baseVolume = (velocity / 127) * masterGain;
        const targetValue = baseVolume * scaleFactor;
        const currentValue = gainNode.gain.value;
        
        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setValueAtTime(currentValue, now);
        gainNode.gain.linearRampToValueAtTime(targetValue, now + attack);

    }

}

function midiNoteToFrequency(note) {
    const totalCents = (transposeSemi * 100) + transposeCent;
    const centMultiplier = Math.pow(2, totalCents/1200);
    return 440 * Math.pow(2, (note - 69) / 12) * centMultiplier;
}

function noteOn(note, velocity, midiPlayerActivated=false) {

    const allNotes = {...activeNotes, ...sustainedNotes, ...releasingNotes};
    
    if (Object.keys(allNotes).length >= 25) return;

    if (sustainedNotes[note]) {
        const { oscillators, gainNode } = sustainedNotes[note];
        const now = audioContext.currentTime;
        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setValueAtTime(gainNode.gain.value, now);
        gainNode.gain.linearRampToValueAtTime(0, now + release);

        oscillators.forEach(({ oscillator }) => {
            oscillator.stop(now + release);
        });


        delete sustainedNotes[note];
    }

    if (activeNotes[note]) {
        noteOff(note);
    }

    let oscillators = [];
    let baseFrequency = midiNoteToFrequency(note);

    const gainNode = audioContext.createGain();
    gainNode.gain.value = 0;

    let totalEnergy = 0;

    for (let i = 0; i < harmonicSettings.slice(1).length; i++) {
        const volume = parseFloat(harmonicSettings.slice(1)[i].volume);
        totalEnergy += volume * volume;
    }
    
    const normalizationFactor = totalEnergy > 0 ? 1 / Math.sqrt(totalEnergy) : 0;

    for (let i = 0; i < harmonicSettings.slice(1).length; i++) {
        const oscillator = audioContext.createOscillator();
        const frequency = baseFrequency * (i + 1);
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency * bendFactor

        const harmonicGain = audioContext.createGain();
        harmonicGain.gain.value = harmonicSettings.slice(1)[i].volume * normalizationFactor;

        oscillator.connect(harmonicGain);
        harmonicGain.connect(gainNode);
        oscillator.start();

        oscillators.push({ oscillator: oscillator, gainNode: harmonicGain, baseFrequency: frequency });

    }

    gainNode.connect(audioContext.destination);

    activeNotes[note] = {
        oscillators: oscillators,
        gainNode: gainNode,
        velocity: velocity,
        midiPlayerActivated: midiPlayerActivated
    };

    normalizeGains();

}

function noteOff(note) {
    if (!activeNotes[note]) {
        return;
    }
    
    if (sustainOn) {
        sustainedNotes[note] = activeNotes[note];
        delete activeNotes[note];
    }
    else {
        const { oscillators, gainNode } = activeNotes[note];

        const now = audioContext.currentTime;
        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setValueAtTime(gainNode.gain.value, now);
        gainNode.gain.linearRampToValueAtTime(0, now + release);
        
        releasingNotes[note] = {
            oscillators,
            gainNode,
            releaseEnd: now + release
        };

        delete activeNotes[note];

        setTimeout(() => {
            if (releasingNotes[note]) {
                oscillators.forEach(({ oscillator }) => {
                    oscillator.stop(now);
                });
                delete releasingNotes[note];
            }
        }, release * 1000)

        normalizeGains();
        
    }
}

function onControlChange(controller, value) {
    if (controller === 64) {
        const prevSustainState = sustainOn;
        sustainOn = value >= 64;

        if (prevSustainState && !sustainOn) {
            releaseSustainedNotes();
        }
    }
}

function releaseSustainedNotes() {
    for (const note in sustainedNotes) {
        const { oscillators, gainNode } = sustainedNotes[note];

        const now = audioContext.currentTime;
        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setValueAtTime(gainNode.gain.value, now);
        gainNode.gain.linearRampToValueAtTime(0, now + release);

        releasingNotes[note] = {
            oscillators,
            gainNode,
            releaseEnd: now + release
        };

        delete activeNotes[note];

        setTimeout(() => {
            if (releasingNotes[note]) {
                oscillators.forEach(({ oscillator }) => {
                    oscillator.stop(now);
                });
                delete releasingNotes[note];
            }
        }, release * 1000)

    }
    sustainedNotes = {};
}

function onPitchBend(value) {
    const semitones = ((value / 127) * 4) - 2;
    
    bendFactor = Math.pow(2, semitones / 12);

    const allNotes = {...activeNotes, ...sustainedNotes, ...releasingNotes};

    for (const noteKey in allNotes) {
        const note = allNotes[noteKey];  

        if (note) {
            note.oscillators.forEach(({oscillator, gainNode, baseFrequency}) => {
                oscillator.frequency.value = baseFrequency * bendFactor;
            });
        }
    }

}


//---------------WAVEFORM GRAPH------------------ //


function initWaveformGraph() {
    waveformGraph = document.getElementById('waveform-graph');

    if(!waveformGraph) {
        console.error('Waveform graph not found')
        return;
    }

    waveformGraph.width = waveformGraph.clientWidth;
    waveformGraph.height = waveformGraph.clientHeight;
    waveformGraphCSS = window.getComputedStyle(waveformGraph);
    waveformCtx = waveformGraph.getContext('2d');

    drawWaveform();

}

function drawWaveform() {
    requestAnimationFrame(drawWaveform);

    if (!waveformCtx) return;

    if (waveformGraphCSS.backgroundColor) {
        waveformCtx.fillStyle = waveformGraphCSS.backgroundColor;
    }
    else {
        waveformCtx.fillStyle = 'rgb(0, 0, 0)';
    }
    waveformCtx.fillRect(0, 0, waveformGraph.width, waveformGraph.height);

    const allNotes = {...activeNotes, ...sustainedNotes, ...releasingNotes};

    if (Object.keys(allNotes).length === 0) return;

    const numPoints = waveformGraph.width;

    const oscillatorData = [];
    let totalGain = 0;

    for (const noteKey in allNotes) {
        const note = allNotes[noteKey]
        const {oscillators, gainNode} = note
        const noteGain = gainNode.gain.value;

        for (let i = 0; i < oscillators.length; i++) {
            const { oscillator, gainNode: harmonicGain } = oscillators[i];
            const frequency = oscillator.frequency.value;
            const amplitude = harmonicGain.gain.value * noteGain;

            oscillatorData.push({frequency, amplitude});
            totalGain += amplitude

        }
    }

    function fourierSynthesis(t) {
        let sum = 0;

        for (const osc of oscillatorData) {
            sum += osc.amplitude * Math.sin(2 * Math.PI * osc.frequency * t);
        }

        return totalGain > 1 ? sum / totalGain : sum;
    }

    const width = waveformGraph.width;
    const height = waveformGraph.height;
    const timeScale = 1 / referenceFrequency; 

    waveformCtx.strokeStyle = 'rgb(0, 255, 0)';
    waveformCtx.lineWidth = 2;
    waveformCtx.beginPath();

    for (let x = 0; x < width; x++) {
        const t = (x / width) * timeScale;
        const val = fourierSynthesis(t);
        const y = (1 - val) * height / 2;

        if (x==0) {
            waveformCtx.moveTo(x, y);
        }
        else {
            waveformCtx.lineTo(x, y);
        }
    }
    waveformCtx.stroke();
}


//---------------MIDI PLAYER------------------ //

async function initMIDIPlayer() {

    const midiSelectDropdown = document.getElementById('midi-player-select-dropdown');
    const midiUpload = document.getElementById('midi-player-upload-button');
    const midiCurrentFileLabel = document.getElementById('midi-current-file-label');
    const midiPlay = document.getElementById('midi-play');
    const midiLoopCheckbox = document.getElementById('midi-loop-checkbox');
    const midiSpeedControlBar = document.getElementById('midi-speed-control-bar');
    const midiSpeedControlValue = document.getElementById('midi-speed-control-value');
    const midiProgressBar = document.getElementById('midi-progress-bar');
    const midiProgressFill = document.getElementById('midi-progress-fill');
    const midiProgressHandle = document.getElementById('midi-progress-handle');
    const midiCurrentTime = document.getElementById('midi-current-time');
    const midiTotalTime = document.getElementById('midi-total-time');

    let midiPlayer;
    let midiFile = null;
    let isPlaying = false;
    let isLooping = false;
    let isDragging = false;
    let playbackSpeed = 1;

    await loadMIDISelectDropdown();
    initMIDIPlayerGUI();

    async function loadMIDISelectDropdown() {
        try {
            const response = await fetch('midi-files.json');

            if (!response.ok) {
                throw new Error(`HTTP Error! Status: ${response.status}`);
            }

            const midiFiles = await response.json();

            while (midiSelectDropdown.options.length > 1) {
                midiSelectDropdown.remove(1);
            }
            
            for (const category in midiFiles) {
                const optgroup = document.createElement('optgroup');
                optgroup.label = category;
        
                for (const midiFileKey in midiFiles[category]) {
                    const midiFile = midiFiles[category][midiFileKey];
                    const name = midiFile['name'];
                    const path = midiFile['path'];
                    const option = document.createElement('option');
                    option.value = path;
                    option.dataset.name = name;
                    option.textContent = name;
                    optgroup.appendChild(option);
                }
                midiSelectDropdown.appendChild(optgroup);
            }

            midiSelectDropdown.addEventListener('change', async (e) => {
                if (e.target.selectedIndex !== 0) {
                    try {
                        const selectedOption = e.target.selectedOptions[0];
                        const originalPath = selectedOption.value;
                        const fullPath = `${import.meta.env.BASE_URL}${originalPath}`;
                        const name = selectedOption.dataset.name;

                        await loadMIDIFile(fullPath, name);
                    }
                    catch (error) {
                        console.error("Error loading MIDI file: ", error);
                        midiCurrentFileLabel.innerHTML += 'Error loading MIDI file';
                    }
                }
            });
        }
        catch (error) {
            console.error("Error loading MIDI files: ", error);
            midiCurrentFileLabel.innerHTML += 'Error loading MIDI files';
        }

    }

    midiUpload.addEventListener('change', async function() {
        try {
            const file = this.files[0];
            await loadMIDIFile(file);
        }
        catch (error) {
            console.error("Error loading MIDI file: ", error);
            midiCurrentFileLabel.innerHTML += 'Error loading MIDI file';
        }
    });

    async function loadMIDIFile(source, name="") {
        let midiBuffer;
        try {
            if (typeof source === 'string') {
                const response = await fetch(source);
                    
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                midiBuffer = await response.arrayBuffer();
                midiCurrentFileLabel.innerHTML = "MIDI File Loaded: " + name;
            }
            else if (source instanceof File) {
                midiBuffer = await source.arrayBuffer();
                midiCurrentFileLabel.innerHTML = "MIDI File Loaded: " + source['name'];
            }
            else if (source instanceof ArrayBuffer) {
                midiBuffer = source;
            }
            else {
                throw new Error('Invalid source type. Must be a URL string, File, or ArrayBuffer');
            }

            const midi = new Midi(midiBuffer)
            const mergedMIDI = mergeTracks(midi);
            console.log(mergedMIDI);
            const parsedMIDI = parseMidi(new Uint8Array(mergedMIDI.toArray()));

            if (midiPlayer) {
                if (midiPlayer.isPlaying) {
                    midiPlayer.pause();
                }
            
                if (midiPlayer.timeoutId) {
                    clearTimeout(midiPlayer.timeoutId);
                }

                midiPlay.textContent = "Play";
                midiPlay.classList.remove("midi-playing");
            
                midiPlayer = null;
            }   

            midiPlayer = new MIDIPlayer(parsedMIDI, onMIDIMessage, isPlaying, isLooping, playbackSpeed, midiPlay, mergedMIDI);

            midiUpload.value = '';
            midiSelectDropdown.selectedIndex = 0;

            if (midiPlayer) {
                midiTotalTime.textContent = midiPlayer.formatTime(midiPlayer.getTotalTime());
                midiCurrentTime.textContent = '0:00'
                midiProgressHandle.style.left = `0%`;
                midiProgressFill.style.width = `0%`;
            }
        }
        catch (error) {
            console.error("Error loading MIDI file: ", error);
            midiCurrentFileLabel.innerHTML = 'Error loading MIDI file';
        }
    }

    function mergeTracks(midi) {
        let mergedMidi = new Midi()
        mergedMidi.header = midi.header

        let mergedTrack = mergedMidi.addTrack();
    
        midi.tracks.forEach(track => {
            mergedTrack.notes.push(...track.notes);
            
            if (track.controlChanges) {
                Object.values(track.controlChanges).forEach(controlChangeArray => {
                    controlChangeArray.forEach(cc => {
                        mergedTrack.addCC(cc);
                    });
                });
            }
            
            if (track.pitchBends) {
                track.pitchBends.forEach(pb => {
                    mergedTrack.addPitchBend(pb);
                });
            }
        });
    
        return mergedMidi;
    }

    function initMIDIPlayerGUI() {
        midiPlay.addEventListener('click', () => {
            if (!midiPlayer) return;

            if (midiPlayer.isPlaying) {
                midiPlay.textContent = "Play";
                midiPlay.classList.remove("midi-playing");
                isPlaying = true;
                midiPlayer.pause();
            } else {
                midiPlay.textContent = "Pause";
                midiPlay.classList.add("midi-playing");
                isPlaying = false;
                midiPlayer.play();
            }
        });

        midiLoopCheckbox.addEventListener('change', () => {
            isLooping = midiLoopCheckbox.checked;
            if (midiPlayer) {
                midiPlayer.setLooping(isLooping);
            }
        });
        midiSpeedControlBar.addEventListener('input', () => {
            playbackSpeed = parseFloat(midiSpeedControlBar.value);
            midiSpeedControlValue.textContent = playbackSpeed.toFixed(2) + 'x';
            if (midiPlayer) {
                midiPlayer.setPlaybackSpeed(playbackSpeed);
            }
        });

        midiProgressBar.addEventListener('mousedown', (e) => {
            if (!midiPlayer) return;

            isDragging = true;
            updateProgressFromMouse(e);

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);

        });

        function onMouseMove(e) {
            if (isDragging) {
                updateProgressFromMouse(e);
            }
        }

        function onMouseUp() {
            isDragging = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        }

        function updateProgressFromMouse(e) {
            if (!midiPlayer) return;

            const rect = midiProgressBar.getBoundingClientRect();
            const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
            const percentage = (x / rect.width) * 100;
            
            midiProgressHandle.style.left = `${percentage}%`;
            midiProgressFill.style.width = `${percentage}%`;

            const currentTime = midiPlayer.setPlaybackPosition(percentage);

            midiCurrentTime.textContent = midiPlayer.formatTime(currentTime);
        }

        requestAnimationFrame(updatePlayerUI);

        function updatePlayerUI () {
            if (midiPlayer && midiPlayer.isPlaying && !isDragging) {
                const currentTime = midiPlayer.getCurrentPosition();
                const percentage = midiPlayer.getProgressPercentage();
                
                midiCurrentTime.textContent = midiPlayer.formatTime(currentTime);

                midiProgressHandle.style.left = `${percentage}%`;
                midiProgressFill.style.width = `${percentage}%`;
            }
            requestAnimationFrame(updatePlayerUI);
        }

    }

}

class MIDIPlayer {
    constructor(MIDIData, onMIDIEvent, playing=false, looping=false, playbackSpeed=1.0, playButton=null, originalMIDI=null) {
        this.MIDIData = MIDIData;
        this.onMIDIEvent = onMIDIEvent;
        this.isPlaying = playing;
        this.isLooping = looping;
        this.playbackSpeed = playbackSpeed;
        this.timeoutId = null;
        this.maxSimultaneousEvents = 15;
        this.playButton = playButton;
        this.originalMIDI = originalMIDI;

        this.activeNotes = new Set();

        const {processedEvents, tempoEvents} = this.preprocessEvents();
        this.processedEvents = processedEvents;
        this.tempoEvents = tempoEvents;

        this.currentIndex = 0;
        this.startTime = 0;
        this.pauseTime = 0;
        this.totalTime = this.calculateTotalTime();

        console.log(this.formatTime(this.totalTime));
    }

    preprocessEvents() {
        if (!this.MIDIData || !this.MIDIData.tracks || this.MIDIData.tracks.length === 0) {
            return { processedEvents: [], tempoEvents: [{ tick: 0, tempo: 500000 }] };
        }

        const processedEvents = [];
        const tempoEvents = [];
        const ticksPerBeat = this.MIDIData.header.ticksPerBeat || 480;

        this.MIDIData.tracks.forEach(track => {
            let absoluteTick = 0;
            
            track.forEach(event => {
                absoluteTick += event.deltaTime;
                
                if (event.type === 'setTempo') {
                    tempoEvents.push({
                        tick: absoluteTick,
                        tempo: event.microsecondsPerBeat
                    });
                }
            });
        });

        tempoEvents.sort((a, b) => a.tick - b.tick);
        if (tempoEvents.length === 0 || tempoEvents[0].tick > 0) {
            tempoEvents.unshift({ tick: 0, tempo: 500000 });
        }

        this.MIDIData.tracks.forEach((track, trackIndex) => {
            let absoluteTick = 0;
            track.forEach(event => {
                absoluteTick += event.deltaTime;

                if (['noteOn', 'noteOff', 'controller'].includes(event.type)) {
                    const absoluteTime = this.ticksToMs(absoluteTick, tempoEvents, ticksPerBeat);
                    processedEvents.push({
                        ...event,
                        absoluteTick,
                        absoluteTime,
                        track: trackIndex
                    });
                }
            });
        });

        if (this.originalMIDI) {
            this.originalMIDI.tracks.forEach((track, trackIndex) => {
                track.pitchBends.forEach(pitchBend => {
                    const absoluteTime = this.ticksToMs(pitchBend.ticks, tempoEvents, ticksPerBeat);
                    
                    processedEvents.push({
                        type: 'pitchBend',
                        value: pitchBend.value,
                        absoluteTick: pitchBend.ticks,
                        absoluteTime: absoluteTime,
                        track: trackIndex
                    });
                });
            });
        }

        processedEvents.sort((a, b) => {
            if (a.absoluteTick !== b.absoluteTick) {
                return a.absoluteTick - b.absoluteTick;
            }
            if (a.type === 'noteOff' && b.type === 'noteOn') {
                return -1;
            }
            if (a.type === 'noteOn' && b.type === 'noteOff') {
                return 1;
            }
            return a.track - b.track;
        })

        return {processedEvents, tempoEvents}
    }

    ticksToMs(ticks, tempoMap, ticksPerBeat) {
        let milliseconds = 0;
        let lastTempoTick = 0;
        let lastTempo = tempoMap[0].tempo;

        for (let i = 0; i < tempoMap.length; i++) {
            const tempoEvent = tempoMap[i];

            if (tempoEvent.tick < ticks) {
                const segmentTicks = tempoEvent.tick - lastTempoTick;
                milliseconds += (segmentTicks / ticksPerBeat ) * (lastTempo / 1000);
                
                lastTempoTick = tempoEvent.tick;
                lastTempo = tempoEvent.tempo;
            }
            else {
                break;
            }
        }
        
        const remainingTicks = ticks - lastTempoTick;
        milliseconds += (remainingTicks / ticksPerBeat ) * (lastTempo / 1000);

        return milliseconds;
    }

    calculateTotalTime() {
        if (this.processedEvents.length === 0) {
            return 0;
        }

        const lastEvent = this.processedEvents[this.processedEvents.length - 1];
        return lastEvent.absoluteTime + 500;
    }

    formatTime(ms) {
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    play() {

        if (this.isPlaying) return;

        this.isPlaying = true;

        if (this.currentIndex >= this.processedEvents.length) {
            this.currentIndex = 0;
        }

        if (this.pauseTime > 0) {
            this.startTime = performance.now() - (this.pauseTime / this.playbackSpeed);
        } 
        else {
            const currentEvent = this.processedEvents[this.currentIndex] || { absoluteTime: 0 };
            this.startTime = performance.now() - (currentEvent.absoluteTime / this.playbackSpeed);

            console.log(performance.now())
            console.log(currentEvent.absoluteTime)
            console.log(this.playbackSpeed)
        }
        this.processEvents();

        if (this.playButton) {
            this.playButton.textContent = 'Pause'
            this.playButton.classList.add("midi-playing");
        }
    }

    pause() {
        if (!this.isPlaying) return;

        this.pauseTime = this.getCurrentPosition();
        this.isPlaying = false;

        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }

        const resetPitch = {
            data: new Uint8Array([
                224,
                0,
                64
            ])
        }; 
        
        this.onMIDIEvent(resetPitch, true);

        this.releaseActiveNotes();

        if (this.playButton) {
            this.playButton.textContent = 'Play'
            if (this.playButton.classList.contains("midi-playing")) {
                this.playButton.classList.remove("midi-playing");
            }
        }
    }

    setLooping(isLooping) {
        this.isLooping = isLooping
    }

    setPlaybackSpeed(speed) {
        if (speed <= 0) speed = 0.1;

        const wasPlaying = this.isPlaying;
        const currentPosition = this.getCurrentPosition();

        if (wasPlaying) {
            this.pause();
        }

        this.playbackSpeed = speed;
        this.pauseTime = currentPosition;

        if (wasPlaying) {
            this.play()
        }
    }

    getTotalTime() {
        return this.totalTime;
    }

    getCurrentPosition() {
        if (!this.isPlaying) {
            if (this.currentIndex < this.processedEvents.length) {
                return this.processedEvents[this.currentIndex.absoluteTime];
            }
            return this.pauseTime || 0;
        }
        return (performance.now() - this.startTime) * this.playbackSpeed;
    }

    getProgressPercentage() {
        const current_position = this.getCurrentPosition();
        return (current_position / this.totalTime) * 100;
    }

    setPlaybackPosition(percentage) {
        if (percentage < 0) percentage = 0;
        if (percentage > 100) percentage = 100;

        const targetTime = (percentage / 100) * this.totalTime;

        const wasPlaying = this.isPlaying;

        if (wasPlaying) {
            this.pause();
        }

        this.currentIndex = this.findEventIndexByTime(targetTime);
        this.pauseTime = targetTime;

        if (wasPlaying) {
            this.play();
        }

        return targetTime;
    }

    findEventIndexByTime(targetTime) {
        for (let i = 0; i < this.processedEvents.length; i++) {
            if (this.processedEvents[i].absoluteTime >= targetTime) {
                return i;
            }
        }
        return this.processedEvents.length - 1
    }

    processEvents() {
        if (!this.isPlaying || this.processedEvents.length === 0) return;
        
        const currentTime = this.getCurrentPosition();
        let eventsProcessed = 0;

        while (this.currentIndex < this.processedEvents.length &&
            this.processedEvents[this.currentIndex].absoluteTime <= currentTime) {

            if (eventsProcessed <= this.maxSimultaneousEvents) {
                const event = this.processedEvents[this.currentIndex]
                this.processMIDIEvent(event);
                eventsProcessed += 1;
            }

            this.currentIndex++;
        }

        if (this.currentIndex >= this.processedEvents.length) {
            if (this.isLooping) {
                this.currentIndex = 0;
                this.startTime = performance.now();
                this.pauseTime = 0;
            }
            else {
                console.log("Finished")
                this.pause();
                return;
            }
        }

        this.timeoutId = setTimeout(() => this.processEvents(), 10);
    }

    processMIDIEvent(event) {
        let message = {};
        switch (event.type) {
            case 'noteOn':
                message = {
                    data: new Uint8Array([
                        144,
                        event.noteNumber, 
                        event.velocity || 64
                    ])
                };
            break;

            case 'noteOff':
                message = {
                    data: new Uint8Array([
                        128,
                        event.noteNumber, 
                        event.velocity || 64
                    ])
                };
            break;

            case 'controller': 
                message = {
                    data: new Uint8Array([
                        176,
                        event.noteNumber, 
                        event.velocity || 64
                    ])
                };
            break;

            case 'pitchBend':
                const pitchBendMIDI = 64 + (Math.min(64, event.value * 64));
                console.log(pitchBendMIDI)
                message = {
                    data: new Uint8Array([
                        224,
                        0,
                        pitchBendMIDI
                    ])
                }; 
            break;
            
            default:
                return;
        }
        this.onMIDIEvent(message, true);
    }

    releaseActiveNotes() {
        const allNotes = {...activeNotes, ...sustainedNotes, ...releasingNotes};

        for (const noteKey in allNotes) {
            const note = allNotes[noteKey];
            if (note['midiPlayerActivated']) {
                const now = audioContext.currentTime;

                if (note.oscillators) {
                    note.oscillators.forEach(({ oscillator, gainNode }) => {
                        try {
                            oscillator.stop(now);
                            oscillator.disconnect();
                            gainNode.disconnect();
                        } catch (error) {
                            console.error('Error stopping oscillator:', error);
                        }
                    });
                }

                if (note.gainNode) {
                    note.gainNode.gain.cancelScheduledValues(now);
                    note.gainNode.gain.setValueAtTime(0, now);
                    note.gainNode.disconnect();
                }

                if (activeNotes[noteKey]) delete activeNotes[noteKey];
                if (sustainedNotes[noteKey]) delete sustainedNotes[noteKey];
                if (releasingNotes[noteKey]) delete releasingNotes[noteKey];
            }
        }
    }

}

//---------------VIRTUAL PIANO------------------ //

function initPiano() {
    let currentOctave = 4;
    let currentVelocity = 100;
    let currentPitchBend = 64;
    let targetPitchBend = 64;
    let lerpSpeed = 0.30;
    let pitchBendIntervalId = null;
    let pitchBendState = { 1: false, 2: false}
    let isMouseDown = false;
    let lastClickedKey = null;

    const keyToNoteMap = {
        'a': 0,
        'w': 1,
        's': 2,
        'e': 3,
        'd': 4,
        'f': 5,
        't': 6,
        'g': 7,
        'y': 8,
        'h': 9,
        'u': 10,
        'j': 11,
        'k': 12,
        'o': 13,
        'l': 14,
        'p': 15,
        ';': 16,
        "'": 17
    };

    const piano = document.querySelector('.piano'); 
    const activeKeyboardNotes = {};

    const pianoWhiteKeys = document.querySelectorAll('.piano-white-key');
    const pianoBlackKeys = document.querySelectorAll('.piano-black-key');
    const pianoKeys = [...pianoWhiteKeys, ...pianoBlackKeys];

    const sustainButton = document.querySelector('.piano-settings-button-double[data-key="shift"]');

    const octaveDownButton = document.querySelector('.piano-settings-button[data-key="z"]');
    const octaveUpButton = document.querySelector('.piano-settings-button[data-key="x"]');
    const octaveDisplay = document.querySelector('.piano-info-label[data="octave-display"]');

    const velocityDownButton = document.querySelector('.piano-settings-button[data-key="c"]');
    const velocityUpButton = document.querySelector('.piano-settings-button[data-key="v"]');
    const velocityDisplay = document.querySelector('.piano-info-label[data="velocity-display"]');

    const pitchBendDownButton = document.querySelector('.piano-settings-button[data-key="1"]');
    const pitchBendUpButton = document.querySelector('.piano-settings-button[data-key="2"]');

    function updateOctaveDisplay() {
        if (octaveDisplay) {
            octaveDisplay.textContent = `Current Octave: ${currentOctave}`;
        }
    }

    function updateVelocityDisplay() {
        if (velocityDisplay) {
            velocityDisplay.textContent = `Current Velocity: ${currentVelocity}`;
        }
    }

    function offsetToMIDIValue(offset) {
        return (60 + offset) + (12 * (currentOctave - 4));
    }

    function updatePitchBend() {
        targetPitchBend = 64 + (-pitchBendState[1] * 64) + (pitchBendState[2] * 64);

        if (pitchBendIntervalId === null) {
            pitchBendIntervalId = setInterval(lerpPitchBend, 16);
        }

        function lerpPitchBend() {
            if (Math.abs(currentPitchBend - targetPitchBend) < 1) {
                currentPitchBend = targetPitchBend;
                clearInterval(pitchBendIntervalId);
                pitchBendIntervalId = null;
                sendPitchBend(currentPitchBend);
                return;
            }
            currentPitchBend += (targetPitchBend - currentPitchBend) * lerpSpeed;
            sendPitchBend(Math.round(currentPitchBend));
        }

        function sendPitchBend(value) {
            const message = {
                data: new Uint8Array([
                    224,
                    0,
                    value 
                ])
            };
            onMIDIMessage(message)
        }
    }

    function setActive(element, active=true) {
        if (element) {
            if (active && !element.classList.contains('active')) {
                element.classList.add('active');
            }
            else if (!active && element.classList.contains('active')) {
                element.classList.remove('active')
            }
        }
    }

    function onMousedown() {
        isMouseDown = true;
    }
    document.addEventListener('mousedown', onMousedown);
    document.addEventListener('touchstart', onMousedown);

    function onMouseup(event) {
        isMouseDown = false;

        if (lastClickedKey) {
            const midiNote = offsetToMIDIValue(parseInt(lastClickedKey.dataset.note));
            const message = {
                data: new Uint8Array([
                    128,
                    midiNote,
                    currentVelocity
                ])
            };
            onMIDIMessage(message);
            lastClickedKey = null;
        }
    }
    
    document.addEventListener('mouseup', onMouseup);
    document.addEventListener('touchend', onMouseup);
    document.addEventListener('touchcancel', onMouseup);

    function onKeyTouchmove(event) {
        event.preventDefault(); // Prevents scrolling while touching
    
        const touch = event.touches[0];
        const element = document.elementFromPoint(touch.clientX, touch.clientY);
    
        const isPianoKey = element && (element.classList.contains('piano-white-key') || 
        element.classList.contains('piano-black-key'));

        if (isPianoKey && element !== lastClickedKey) {

            if (lastClickedKey) {
                const prevMidiNote = offsetToMIDIValue(parseInt(lastClickedKey.dataset.note));
                
                const message = {
                    data: new Uint8Array([
                        128,
                        prevMidiNote,
                        currentVelocity
                    ])
                };
                onMIDIMessage(message);
                setActive(lastClickedKey, false);
            }
            const midiNote = offsetToMIDIValue(parseInt(element.dataset.note));
            lastClickedKey = element;
    
            const message = {
                data: new Uint8Array([
                    144,
                    midiNote,
                    currentVelocity
                ])
            };
            onMIDIMessage(message);
            setActive(element, true);
        }
        else if (!isPianoKey && lastClickedKey) {
            const prevMidiNote = offsetToMIDIValue(parseInt(lastClickedKey.dataset.note));
            const message = {
                data: new Uint8Array([
                    128,
                    prevMidiNote,
                    currentVelocity
                ])
            };
            onMIDIMessage(message);
            setActive(lastClickedKey, false);
        }
    }

    piano.addEventListener('touchmove', onKeyTouchmove);

    pianoKeys.forEach(key => {
        function onKeyMousedown(event) {
            event.preventDefault();
            const midiNote = offsetToMIDIValue(parseInt(key.dataset.note));
            lastClickedKey = key;
            
            const message = {
                data: new Uint8Array([
                    144,
                    midiNote,
                    currentVelocity
                ])
            };
            onMIDIMessage(message);
            setActive(key, true);
        }
        key.addEventListener('mousedown', onKeyMousedown);
        key.addEventListener('touchstart', onKeyMousedown);

        function onKeyMouseenter() {
            if (isMouseDown) {
                const midiNote = offsetToMIDIValue(parseInt(key.dataset.note));
                lastClickedKey = key;
                
                const message = {
                    data: new Uint8Array([
                        144,
                        midiNote,
                        currentVelocity
                    ])
                };
                onMIDIMessage(message);
                setActive(key, true);
            }
        }

        key.addEventListener('mouseenter', onKeyMouseenter); 

        function onKeyMouseleave() {
            if (isMouseDown) {
                const midiNote = offsetToMIDIValue(parseInt(key.dataset.note));
                lastClickedKey = key;
                
                const message = {
                    data: new Uint8Array([
                        128,
                        midiNote,
                        currentVelocity
                    ])
                };
                lastClickedKey = null;
                onMIDIMessage(message);
                setActive(key, false);
            }
        }

        key.addEventListener('mouseleave', onKeyMouseleave);

        function onKeyMouseup(event) {

            if (event.type === 'touchend' && lastClickedKey) {
                const midiNote = offsetToMIDIValue(parseInt(lastClickedKey.dataset.note));
                
                const message = {
                    data: new Uint8Array([
                        128,
                        midiNote,
                        currentVelocity
                    ])
                };
                onMIDIMessage(message);
                setActive(lastClickedKey, false);
            }

            const midiNote = offsetToMIDIValue(parseInt(key.dataset.note));
            
            lastClickedKey = key;
            
            const message = {
                data: new Uint8Array([
                    128,
                    midiNote,
                    currentVelocity
                ])
            };
            onMIDIMessage(message);
            setActive(key, false);
        }

        key.addEventListener('mouseup', onKeyMouseup);
        key.addEventListener('touchend', onKeyMouseup);
    });

    function onSustainMousedown(event) {
        event.preventDefault();
        const message = {
            data: new Uint8Array([
                176,
                64,
                127
            ])
        };
        onMIDIMessage(message)
        setActive(sustainButton, true)
    }

    sustainButton.addEventListener('mousedown', onSustainMousedown);
    sustainButton.addEventListener('touchstart', onSustainMousedown);

    function onSustainMouseup() {
        const message = {
            data: new Uint8Array([
                176,
                64,
                0
            ])
        };
        onMIDIMessage(message)
        setActive(sustainButton, false)
    }

    sustainButton.addEventListener('mouseup', onSustainMouseup);
    sustainButton.addEventListener('mouseleave', onSustainMouseup);
    sustainButton.addEventListener('touchend', onSustainMouseup);

    function onOctaveDownButtonMousedown(event) {
        event.preventDefault();
        if (currentOctave > 0) {
            currentOctave--;
            updateOctaveDisplay();
        }
        setActive(octaveDownButton, true);
    }

    octaveDownButton.addEventListener('mousedown', onOctaveDownButtonMousedown);
    octaveDownButton.addEventListener('touchstart', onOctaveDownButtonMousedown);

    function onOctaveDownButtonMouseup() {
        setActive(octaveDownButton, false);
    }
    octaveDownButton.addEventListener('mouseup', onOctaveDownButtonMouseup);
    octaveDownButton.addEventListener('mouseleave', onOctaveDownButtonMouseup);
    octaveDownButton.addEventListener('touchend', onOctaveDownButtonMouseup);

    function onOctaveUpButtonMousedown(event) {
        event.preventDefault();
        if (currentOctave < 7) {
            currentOctave++;
            updateOctaveDisplay();
        }
        setActive(octaveUpButton, true);
    }

    octaveUpButton.addEventListener('mousedown', onOctaveUpButtonMousedown);
    octaveUpButton.addEventListener('touchstart', onOctaveUpButtonMousedown);

    function onOctaveUpButtonMouseup() {
        setActive(octaveUpButton, false)
    }
    octaveUpButton.addEventListener('mouseup', onOctaveUpButtonMouseup);
    octaveUpButton.addEventListener('mouseleave', onOctaveUpButtonMouseup);
    octaveUpButton.addEventListener('touchend', onOctaveUpButtonMouseup);

    function onVelocityDownButtonMousedown(event) {
        event.preventDefault();
        if (currentVelocity > 1) {
            currentVelocity = Math.max(1, currentVelocity - 5);
            updateVelocityDisplay();
        }
        setActive(velocityDownButton, true);
    }

    velocityDownButton.addEventListener('mousedown', onVelocityDownButtonMousedown);
    velocityDownButton.addEventListener('touchstart', onVelocityDownButtonMousedown);

    function onVelocityDownButtonMouseup() {
        setActive(velocityDownButton, false)
    }

    velocityDownButton.addEventListener('mouseup', onVelocityDownButtonMouseup);
    velocityDownButton.addEventListener('mouseleave', onVelocityDownButtonMouseup);
    velocityDownButton.addEventListener('touchend', onVelocityDownButtonMouseup);
    
    function onVelocityUpButtonMousedown(event) {
        event.preventDefault();
        if (currentVelocity < 128) {
            currentVelocity = Math.min(127, currentVelocity + 5);
            updateVelocityDisplay();
        }
        setActive(velocityUpButton, true);
    }

    velocityUpButton.addEventListener('mousedown', onVelocityUpButtonMousedown);
    velocityUpButton.addEventListener('touchstart', onVelocityUpButtonMousedown);

    function onVelocityUpButtonMouseup() {
        setActive(velocityUpButton, false)
    }

    velocityUpButton.addEventListener('mouseup', onVelocityUpButtonMouseup);
    velocityUpButton.addEventListener('mouseleave', onVelocityUpButtonMouseup);
    velocityUpButton.addEventListener('touchend', onVelocityUpButtonMouseup);

    function onPitchBendDownMousedown(event) {
        event.preventDefault();
        pitchBendState[1] = true;
        updatePitchBend();
        setActive(pitchBendDownButton, true);
    }
    pitchBendDownButton.addEventListener('mousedown', onPitchBendDownMousedown);
    pitchBendDownButton.addEventListener('touchstart', onPitchBendDownMousedown);

    function onPitchBendDownMouseup() {
        pitchBendState[1] = false;
        updatePitchBend();
        setActive(pitchBendDownButton, false)
    }

    pitchBendDownButton.addEventListener('mouseup', onPitchBendDownMouseup);
    pitchBendDownButton.addEventListener('mouseleave', onPitchBendDownMouseup);
    pitchBendDownButton.addEventListener('touchend', onPitchBendDownMouseup);

    function onPitchBendUpMousedown(event) {
        event.preventDefault();
        pitchBendState[2] = true;
        updatePitchBend();
        setActive(pitchBendUpButton, true);
    }
    pitchBendUpButton.addEventListener('mousedown', onPitchBendUpMousedown);
    pitchBendUpButton.addEventListener('touchstart', onPitchBendUpMousedown);

    function onPitchBendUpMouseup() {
        pitchBendState[2] = false;
        updatePitchBend();
        setActive(pitchBendUpButton, false)
    }

    pitchBendUpButton.addEventListener('mouseup', onPitchBendUpMouseup);
    pitchBendUpButton.addEventListener('mouseleave', onPitchBendUpMouseup);
    pitchBendUpButton.addEventListener('touchend', onPitchBendUpMouseup);

    document.addEventListener('keydown', e => {
        let key = e.key.toLowerCase();
        if (key === '!') key = '1';
        if (key === '@') key = '2';

        if (key === 'shift') {
            const message = {
                data: new Uint8Array([
                    176,
                    64,
                    127
                ])
            };
            onMIDIMessage(message)
            setActive(sustainButton, true)
        }

        if (key === 'z') {
            if (currentOctave > 0) {
                currentOctave--;
                updateOctaveDisplay();
            }
            setActive(octaveDownButton, true);
        }

        if (key === 'x') {
            if (currentOctave < 7) {
                currentOctave++;
                updateOctaveDisplay();
            }
            setActive(octaveUpButton, true);
        }

        if (key === 'c') {
            if (currentVelocity > 1) {
                currentVelocity = Math.max(1, currentVelocity - 5);
                updateVelocityDisplay();
            }
            setActive(velocityDownButton, true);
        }

        if (key === 'v') {
            if (currentVelocity < 128) {
                currentVelocity = Math.min(127, currentVelocity + 5);
                updateVelocityDisplay();
            }
            setActive(velocityUpButton, true);
        }

        if (key === '1') {
            pitchBendState[1] = true;
            updatePitchBend();
            setActive(pitchBendDownButton, true);
        }

        if (key === "2") {
            pitchBendState[2] = true;
            updatePitchBend();
            setActive(pitchBendUpButton, true);
        }


        if (keyToNoteMap[key] !== undefined) {
            const offset = keyToNoteMap[key];
            const midiNote = offsetToMIDIValue(offset);
            const keyElement = Array.from(pianoKeys).find(elem => {
                const keyLabel = elem.querySelector('.key-label');
                return keyLabel && keyLabel.textContent.toLowerCase() === key;
            });

            if (keyElement) {
                setActive(keyElement, true);
            }

            if (!activeKeyboardNotes[key]) {
                activeKeyboardNotes[key] = midiNote;

                const message = {
                    data: new Uint8Array([
                        144,
                        midiNote,
                        currentVelocity
                    ])
                };

                onMIDIMessage(message);
            }
        }
    });

    document.addEventListener('keyup', e => {
        let key = e.key.toLowerCase();
        if (key === '!') key = '1';
        if (key === '@') key = '2';

        if (key === 'shift') {
            const message = {
                data: new Uint8Array([
                    176,
                    64,
                    0
                ])
            };
            onMIDIMessage(message)
            setActive(sustainButton, false)
        }

        if (key === 'z') {
            setActive(octaveDownButton, false);
        }

        if (key === 'x') {
            setActive(octaveUpButton, false);
        }

        if (key === 'c') {
            setActive(velocityDownButton, false);
        }

        if (key === 'v') {
            setActive(velocityUpButton, false);
        }

        if (key === '1') {
            pitchBendState[1] = false;
            updatePitchBend();
            setActive(pitchBendDownButton, false);
        }

        if (key === "2") {
            pitchBendState[2] = false;
            updatePitchBend();
            setActive(pitchBendUpButton, false);
        }

        if (keyToNoteMap[key] !== undefined && activeKeyboardNotes[key]) {
            const midiNote = activeKeyboardNotes[key]
            const keyElement = Array.from(pianoKeys).find(elem => {
                const keyLabel = elem.querySelector('.key-label');
                return keyLabel && keyLabel.textContent.toLowerCase() === key;
            });

            if (keyElement) {
                setActive(keyElement, false);
            }
            
            const message = {
                data: new Uint8Array([
                    128,
                    midiNote,
                    currentVelocity
                ])
            };

            onMIDIMessage(message);

            delete activeKeyboardNotes[key];

        }
    });


}