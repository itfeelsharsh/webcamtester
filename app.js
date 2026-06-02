let activeStream = null;
let analysisInterval = null;
let fpsInterval = null;
let animationFrameId = null;
let pc1 = null;
let pc2 = null;
let bitrateInterval = null;
let prevBytesSent = 0;
let prevBitrateTime = 0;
let frameCount = 0;
let lastFpsUpdate = 0;
let liveFps = 0;

const videoEl = document.getElementById('webcam-video');
const placeholderEl = document.getElementById('video-placeholder');
const deviceSelect = document.getElementById('device-select');
const aspectSelect = document.getElementById('aspect-select');
const mirrorToggle = document.getElementById('mirror-toggle');
const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');
const btnCapture = document.getElementById('btn-capture');
const canvas = document.getElementById('analysis-canvas');
const ctx = canvas.getContext('2d');
const videoContainer = document.getElementById('video-container');

const elName = document.getElementById('val-name');
const elRating = document.getElementById('val-rating');
const elMic = document.getElementById('val-mic');
const elSpeaker = document.getElementById('val-speaker');
const elFps = document.getElementById('val-fps');
const elStream = document.getElementById('val-stream');
const elMode = document.getElementById('val-mode');
const elMegapixels = document.getElementById('val-megapixels');
const elResolution = document.getElementById('val-resolution');
const elStandard = document.getElementById('val-standard');
const elAspect = document.getElementById('val-aspect');
const elPng = document.getElementById('val-png');
const elJpeg = document.getElementById('val-jpeg');
const elBitrate = document.getElementById('val-bitrate');
const elColors = document.getElementById('val-colors');
const elRgb = document.getElementById('val-rgb');
const elColorPreview = document.getElementById('color-preview');
const elLightness = document.getElementById('val-lightness');
const elLuminosity = document.getElementById('val-luminosity');
const elBrightness = document.getElementById('val-brightness');
const elHue = document.getElementById('val-hue');
const elSaturation = document.getElementById('val-saturation');

window.addEventListener('DOMContentLoaded', () => {
    checkAudioDevices();
    navigator.mediaDevices.addEventListener('devicechange', checkAudioDevices);
});

btnStart.addEventListener('click', startTest);
btnStop.addEventListener('click', stopTest);
btnCapture.addEventListener('click', capturePhoto);

deviceSelect.addEventListener('change', () => {
    if (activeStream) {
        stopTest();
        startTest();
    }
});

aspectSelect.addEventListener('change', () => {
    if (activeStream) {
        stopTest();
        startTest();
    }
});

mirrorToggle.addEventListener('change', () => {
    if (mirrorToggle.checked) {
        videoEl.classList.add('mirrored');
    } else {
        videoEl.classList.remove('mirrored');
    }
});

async function checkAudioDevices() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        let hasMic = false;
        let hasSpeaker = false;

        devices.forEach(device => {
            if (device.kind === 'audioinput') hasMic = true;
            if (device.kind === 'audiooutput') hasSpeaker = true;
        });

        elMic.textContent = hasMic ? "Yes" : "No";
        elSpeaker.textContent = hasSpeaker ? "Yes" : "No";
        
        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        const currentSelection = deviceSelect.value;
        deviceSelect.innerHTML = '';
        
        if (videoDevices.length === 0) {
            const opt = document.createElement('option');
            opt.value = "";
            opt.textContent = "-- No Cameras Found --";
            deviceSelect.appendChild(opt);
        } else {
            videoDevices.forEach((device, index) => {
                const opt = document.createElement('option');
                opt.value = device.deviceId;
                opt.textContent = device.label || `Camera ${index + 1}`;
                deviceSelect.appendChild(opt);
            });
            if (currentSelection && videoDevices.some(d => d.deviceId === currentSelection)) {
                deviceSelect.value = currentSelection;
            }
        }
    } catch (err) {
        console.error(err);
        elMic.textContent = "Error";
        elSpeaker.textContent = "Error";
    }
}

async function startTest() {
    btnStart.disabled = true;
    
    const selectedAspect = aspectSelect.value;
    const constraints = {
        audio: false,
        video: {
            width: { ideal: 4096 },
            height: { ideal: 2160 }
        }
    };
    
    if (selectedAspect && selectedAspect !== "auto") {
        constraints.video.aspectRatio = { ideal: parseFloat(selectedAspect) };
    }
    
    if (deviceSelect.value) {
        constraints.video.deviceId = { exact: deviceSelect.value };
    }
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        activeStream = stream;
        videoEl.srcObject = stream;
        placeholderEl.style.display = 'none';
        
        btnStop.disabled = false;
        btnCapture.disabled = false;
        
        await checkAudioDevices();
        
        const track = stream.getVideoTracks()[0];
        const settings = track.getSettings();
        
        elName.textContent = track.label || "Generic Web Camera";
        elStream.textContent = "Video Stream (Color)";
        
        const width = settings.width || videoEl.videoWidth || 640;
        const height = settings.height || videoEl.videoHeight || 480;
        
        if (selectedAspect === 'auto') {
            videoContainer.style.setProperty('--aspect-ratio', `${width} / ${height}`);
        } else {
            videoContainer.style.setProperty('--aspect-ratio', selectedAspect);
        }
        
        updateResolutionProperties(width, height);
        startFpsMeasurement(settings.frameRate);
        startBitrateMeasurement(stream);
        startImageAnalysis(width, height);
        
    } catch (err) {
        console.error(err);
        alert("Could not access webcam. Please ensure camera permissions are allowed.");
        btnStart.disabled = false;
        placeholderEl.style.display = 'flex';
        placeholderEl.innerHTML = `<span>Error: Permission Denied or Device Busy</span>`;
    }
}

function stopTest() {
    if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
        activeStream = null;
    }
    
    videoEl.srcObject = null;
    placeholderEl.style.display = 'flex';
    placeholderEl.innerHTML = `<span>Camera stream is inactive.<br>Click "Start Camera Test" below.</span>`;
    
    clearInterval(analysisInterval);
    clearInterval(bitrateInterval);
    cancelAnimationFrame(animationFrameId);
    
    if (pc1) { pc1.close(); pc1 = null; }
    if (pc2) { pc2.close(); pc2 = null; }
    
    btnStart.disabled = false;
    btnStop.disabled = true;
    btnCapture.disabled = true;
    
    resetSpecFields();
}

function resetSpecFields() {
    elName.textContent = "Not selected";
    elRating.textContent = "—";
    elFps.textContent = "—";
    elStream.textContent = "—";
    elMode.textContent = "—";
    elMegapixels.textContent = "—";
    elResolution.textContent = "—";
    elStandard.textContent = "—";
    elAspect.textContent = "—";
    elPng.textContent = "—";
    elJpeg.textContent = "—";
    elBitrate.textContent = "—";
    elColors.textContent = "—";
    elRgb.textContent = "—";
    elColorPreview.style.backgroundColor = 'transparent';
    elLightness.textContent = "—";
    elLuminosity.textContent = "—";
    elBrightness.textContent = "—";
    elHue.textContent = "—";
    elSaturation.textContent = "—";
}

function getGCD(a, b) {
    return b ? getGCD(b, a % b) : a;
}

function updateResolutionProperties(w, h) {
    elResolution.textContent = `${w} x ${h}`;
    
    const mp = (w * h) / 1000000;
    elMegapixels.textContent = `${mp.toFixed(2)} MP`;
    
    const gcd = getGCD(w, h);
    const aspectW = w / gcd;
    const aspectH = h / gcd;
    
    let aspectStr = `${aspectW}:${aspectH}`;
    const ratio = w / h;
    if (Math.abs(ratio - 1.777) < 0.01) aspectStr = "16:9 (Widescreen)";
    else if (Math.abs(ratio - 1.333) < 0.01) aspectStr = "4:3 (Standard)";
    else if (Math.abs(ratio - 1.6) < 0.01) aspectStr = "16:10";
    else if (Math.abs(ratio - 1.25) < 0.01) aspectStr = "5:4";
    else if (Math.abs(ratio - 2.333) < 0.01) aspectStr = "21:9";
    else if (ratio === 1) aspectStr = "1:1 (Square)";
    
    elAspect.textContent = aspectStr;
    
    let standard = "Custom / Other";
    if (w >= 3840 && h >= 2160) standard = "4K UHD (Ultra HD)";
    else if (w >= 2560 && h >= 1440) standard = "2K / QHD (1440p)";
    else if (w >= 1920 && h >= 1080) standard = "1080p (Full HD)";
    else if (w >= 1280 && h >= 720) standard = "720p (HD)";
    else if (w === 1024 && h === 768) standard = "XGA";
    else if (w === 800 && h === 600) standard = "SVGA";
    else if (w === 640 && h === 480) standard = "VGA (480p)";
    else if (w === 320 && h === 240) standard = "QVGA (240p)";
    
    elStandard.textContent = standard;
}

function startFpsMeasurement(targetFps) {
    frameCount = 0;
    lastFpsUpdate = performance.now();
    
    function measureLoop(now) {
        frameCount++;
        
        const delta = now - lastFpsUpdate;
        if (delta >= 1000) {
            liveFps = (frameCount * 1000) / delta;
            frameCount = 0;
            lastFpsUpdate = now;
            
            const targetStr = targetFps ? `${targetFps} FPS` : 'Auto';
            elFps.textContent = `${liveFps.toFixed(1)} FPS (Target: ${targetStr})`;
        }
        
        if (activeStream) {
            animationFrameId = requestAnimationFrame(measureLoop);
        }
    }
    
    animationFrameId = requestAnimationFrame(measureLoop);
}

async function startBitrateMeasurement(stream) {
    try {
        pc1 = new RTCPeerConnection({
            sdpSemantics: 'unified-plan'
        });
        pc2 = new RTCPeerConnection({
            sdpSemantics: 'unified-plan'
        });
        
        pc1.onicecandidate = e => e.candidate && pc2.addIceCandidate(e.candidate);
        pc2.onicecandidate = e => e.candidate && pc1.addIceCandidate(e.candidate);
        
        const videoTrack = stream.getVideoTracks()[0];
        pc1.addTrack(videoTrack, stream);
        
        const offer = await pc1.createOffer();
        await pc1.setLocalDescription(offer);
        await pc2.setRemoteDescription(offer);
        
        const answer = await pc2.createAnswer();
        await pc2.setLocalDescription(answer);
        await pc1.setRemoteDescription(answer);
        
        prevBytesSent = 0;
        prevBitrateTime = performance.now();
        
        bitrateInterval = setInterval(async () => {
            if (!pc1) return;
            const stats = await pc1.getStats();
            stats.forEach(report => {
                if (report.type === 'outbound-rtp' && report.kind === 'video') {
                    const bytes = report.bytesSent;
                    const now = performance.now();
                    const timeDelta = (now - prevBitrateTime) / 1000;
                    
                    if (prevBytesSent > 0 && timeDelta > 0) {
                        const bitRate = ((bytes - prevBytesSent) * 8) / timeDelta;
                        if (bitRate > 1000000) {
                            elBitrate.textContent = `${(bitRate / 1000000).toFixed(2)} Mbps`;
                        } else {
                            elBitrate.textContent = `${(bitRate / 1000).toFixed(0)} Kbps`;
                        }
                    }
                    prevBytesSent = bytes;
                    prevBitrateTime = now;
                }
            });
        }, 1000);
    } catch (e) {
        elBitrate.textContent = "N/A (Loopback Denied)";
    }
}

function startImageAnalysis(videoW, videoH) {
    const fullResCanvas = document.createElement('canvas');
    let fileAnalysisCounter = 0;
    
    analysisInterval = setInterval(() => {
        if (!videoEl.videoWidth || videoEl.paused || videoEl.ended) return;
        
        const w = videoEl.videoWidth;
        const h = videoEl.videoHeight;
        
        canvas.width = 160;
        canvas.height = 120;
        
        ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
        const imgDataObj = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgDataObj.data;
        
        let sumR = 0, sumG = 0, sumB = 0;
        let isGrayscale = true;
        
        const uniqueColorsSet = new Set();
        
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i+1];
            const b = data[i+2];
            
            sumR += r;
            sumG += g;
            sumB += b;
            
            if (isGrayscale && (Math.abs(r - g) > 15 || Math.abs(r - b) > 15 || Math.abs(g - b) > 15)) {
                isGrayscale = false;
            }
            
            const qColor = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
            uniqueColorsSet.add(qColor);
        }
        
        const pixelCount = data.length / 4;
        const avgR = sumR / pixelCount;
        const avgG = sumG / pixelCount;
        const avgB = sumB / pixelCount;
        
        elMode.textContent = isGrayscale ? "Grayscale (Mono)" : "Color";
        
        const approxColors = uniqueColorsSet.size * 8;
        elColors.textContent = approxColors.toLocaleString();
        
        const rgbStr = `rgb(${Math.round(avgR)}, ${Math.round(avgG)}, ${Math.round(avgB)})`;
        elRgb.textContent = rgbStr;
        elColorPreview.style.backgroundColor = rgbStr;
        
        const hsl = rgbToHsl(avgR, avgG, avgB);
        elHue.textContent = `${Math.round(hsl.h)}°`;
        elSaturation.textContent = `${Math.round(hsl.s * 100)}%`;
        elLightness.textContent = `${Math.round(hsl.l * 100)}%`;
        
        const luminosity = 0.2126 * avgR + 0.7152 * avgG + 0.0722 * avgB;
        elLuminosity.textContent = `${Math.round((luminosity / 255) * 100)}%`;
        
        const brightness = (avgR + avgG + avgB) / 3;
        elBrightness.textContent = `${Math.round((brightness / 255) * 100)}%`;
        
        fileAnalysisCounter++;
        if (fileAnalysisCounter >= 3) {
            fileAnalysisCounter = 0;
            
            fullResCanvas.width = w;
            fullResCanvas.height = h;
            const fullCtx = fullResCanvas.getContext('2d');
            fullCtx.drawImage(videoEl, 0, 0, w, h);
            
            fullResCanvas.toBlob((blob) => {
                if (blob) {
                    elPng.textContent = formatBytes(blob.size);
                }
            }, 'image/png');
            
            fullResCanvas.toBlob((blob) => {
                if (blob) {
                    elJpeg.textContent = formatBytes(blob.size);
                }
            }, 'image/jpeg', 0.85);
        }
        
        const ratingScore = calculateQualityRating(w, h, liveFps, approxColors, luminosity);
        elRating.textContent = ratingScore;
        
    }, 1000);
}

function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    
    if (max === min) {
        h = s = 0;
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    
    return { h: h * 360, s: s, l: l };
}

function calculateQualityRating(w, h, fps, colors, luminosity) {
    let score = 0;
    
    const pixels = w * h;
    if (pixels >= 8294400) score += 40;
    else if (pixels >= 2073600) score += 35;
    else if (pixels >= 921600) score += 25;
    else if (pixels >= 307200) score += 15;
    else score += 5;
    
    if (fps >= 55) score += 30;
    else if (fps >= 28) score += 25;
    else if (fps >= 15) score += 15;
    else score += 5;
    
    const lumPercent = (luminosity / 255) * 100;
    if (lumPercent > 30 && lumPercent < 80) score += 15;
    else if (lumPercent >= 15 && lumPercent <= 90) score += 10;
    else score += 2;
    
    if (colors > 3000) score += 15;
    else if (colors > 1000) score += 10;
    else score += 5;
    
    if (score >= 90) return "Excellent ★★★★★";
    if (score >= 70) return "Good ★★★★☆";
    if (score >= 45) return "Fair ★★★☆☆";
    return "Poor ★★☆☆☆";
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = 1;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

async function capturePhoto() {
    if (!activeStream || !videoEl.videoWidth) return;
    const w = videoEl.videoWidth;
    const h = videoEl.videoHeight;
    const captureCanvas = document.createElement('canvas');
    captureCanvas.width = w;
    captureCanvas.height = h;
    const captureCtx = captureCanvas.getContext('2d');
    
    if (mirrorToggle.checked) {
        captureCtx.translate(w, 0);
        captureCtx.scale(-1, 1);
    }
    
    captureCtx.drawImage(videoEl, 0, 0, w, h);
    
    captureCanvas.toBlob((blob) => {
        if (blob) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const now = new Date();
            const formattedDate = now.toISOString().replace(/T/, '_').replace(/\..+/, '').replace(/:/g, '-');
            a.href = url;
            a.download = `capture_${formattedDate}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    }, 'image/png');
}
