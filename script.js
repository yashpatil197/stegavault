// --- NAVIGATION LOGIC ---

function showApp(mode) {
    // 1. Hide Landing Page
    document.getElementById('landing-page').classList.add('hidden');
    
    // 2. Show App Container & Navbar
    document.getElementById('app-container').classList.remove('hidden');
    document.getElementById('navbar').classList.remove('hidden');

    // 3. Reset Cards
    document.getElementById('card-encode').style.display = 'none';
    document.getElementById('card-decode').style.display = 'none';

    // 4. Show Selected Card
    if (mode === 'encode') {
        document.getElementById('card-encode').style.display = 'flex';
    } else {
        document.getElementById('card-decode').style.display = 'flex';
    }
}

function goHome() {
    // Return to Landing Page
    document.getElementById('landing-page').classList.remove('hidden');
    document.getElementById('app-container').classList.add('hidden');
    document.getElementById('navbar').classList.add('hidden');
    
    // Optional: Reset Inputs
    location.reload(); 
}


// --- CORE STEGAVAULT LOGIC (Same as before) ---

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

let coverImageLoaded = false;
let secretFileLoaded = false;
let secretFileBuffer = null;
let secretFileName = "";

// Event Listeners
document.getElementById('upload-cover').addEventListener('change', (e) => handleImageUpload(e.target.files[0], 'preview-cover', true));
document.getElementById('upload-decode').addEventListener('change', (e) => handleImageUpload(e.target.files[0], 'preview-decode', false));

document.getElementById('upload-secret').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if(!file) return;
    secretFileName = file.name;
    const reader = new FileReader();
    reader.onload = function(evt) {
        secretFileBuffer = evt.target.result;
        secretFileLoaded = true;
        document.getElementById('file-info').innerText = `Selected: ${file.name} (${formatBytes(file.size)})`;
        checkCapacity();
    };
    reader.readAsArrayBuffer(file);
});

document.getElementById('encode-btn').addEventListener('click', encodeProcess);
document.getElementById('decode-btn').addEventListener('click', decodeProcess);


// Helpers
function handleImageUpload(file, imgId, isEncode) {
    if(!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = document.getElementById(imgId);
        img.src = e.target.result;
        img.style.display = 'block';
        img.onload = function() {
            if(isEncode) {
                coverImageLoaded = true;
                checkCapacity();
            } else {
                document.getElementById('decode-btn').disabled = false;
            }
        }
    }
    reader.readAsDataURL(file);
}

function checkCapacity() {
    if (!coverImageLoaded || !secretFileLoaded) return;
    const img = document.getElementById('preview-cover');
    const totalBitsAvailable = (img.naturalWidth * img.naturalHeight) * 3;
    const fileBits = secretFileBuffer.byteLength * 8;
    const requiredBits = fileBits + 800; // Header overhead
    const percent = (requiredBits / totalBitsAvailable) * 100;
    
    const fill = document.getElementById('capacity-fill');
    const text = document.getElementById('capacity-text');
    const btn = document.getElementById('encode-btn');

    fill.style.width = percent + "%";
    text.innerText = `${percent.toFixed(2)}% Capacity Used`;

    if (percent > 100) {
        fill.style.background = "red";
        text.innerText = "File too big for this image!";
        btn.disabled = true;
    } else {
        fill.style.background = "#10b981";
        btn.disabled = false;
    }
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// --- ALGORITHMS ---

function encodeProcess() {
    const password = document.getElementById('pass-encode').value;
    const img = document.getElementById('preview-cover');
    
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0);
    
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imgData.data;

    let header = `${secretFileName}|${secretFileBuffer.byteLength}|`;
    let binaryStream = "";
    for (let i = 0; i < header.length; i++) {
        binaryStream += header.charCodeAt(i).toString(2).padStart(8, '0');
    }

    const uint8View = new Uint8Array(secretFileBuffer);
    for (let i = 0; i < uint8View.length; i++) {
        let byte = uint8View[i];
        if(password) byte = byte ^ password.charCodeAt(i % password.length);
        binaryStream += byte.toString(2).padStart(8, '0');
    }

    let dataIndex = 0;
    for (let i = 0; i < binaryStream.length; i++) {
        if ((dataIndex + 1) % 4 === 0) dataIndex++;
        let bit = binaryStream[i];
        pixels[dataIndex] = (pixels[dataIndex] & 254) | parseInt(bit);
        dataIndex++;
    }

    ctx.putImageData(imgData, 0, 0);
    const link = document.createElement('a');
    link.download = 'stegavault_secure.png';
    link.href = canvas.toDataURL("image/png");
    link.click();
}

function decodeProcess() {
    const password = document.getElementById('pass-decode').value;
    const img = document.getElementById('preview-decode');
    
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0);

    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imgData.data;

    let binaryStream = "";
    let extractedChars = "";
    let headerParts = [];
    let fileLen = 0;
    let fileName = "";
    let metadataRead = false;
    let pixelIdx = 0;

    // Extract Header
    while (!metadataRead && pixelIdx < pixels.length) {
        if ((pixelIdx + 1) % 4 === 0) pixelIdx++;
        binaryStream += (pixels[pixelIdx] & 1).toString();
        pixelIdx++;

        if (binaryStream.length === 8) {
            let char = String.fromCharCode(parseInt(binaryStream, 2));
            extractedChars += char;
            binaryStream = "";
            if (char === '|') {
                headerParts.push(extractedChars.slice(0, -1));
                extractedChars = "";
                if (headerParts.length === 2) {
                    fileName = headerParts[0];
                    fileLen = parseInt(headerParts[1]);
                    metadataRead = true;
                }
            }
        }
    }

    // Extract Body
    const resultBytes = new Uint8Array(fileLen);
    let currentByte = 0;
    binaryStream = ""; 

    while (currentByte < fileLen && pixelIdx < pixels.length) {
        if ((pixelIdx + 1) % 4 === 0) pixelIdx++;
        binaryStream += (pixels[pixelIdx] & 1).toString();
        pixelIdx++;

        if (binaryStream.length === 8) {
            let byteVal = parseInt(binaryStream, 2);
            if(password) byteVal = byteVal ^ password.charCodeAt(currentByte % password.length);
            resultBytes[currentByte] = byteVal;
            currentByte++;
            binaryStream = "";
        }
    }

    document.getElementById('result-area').style.display = 'block';
    document.getElementById('found-filename').innerText = fileName;
    
    document.getElementById('download-secret-btn').onclick = function() {
        const blob = new Blob([resultBytes], {type: "application/octet-stream"});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
    };
}
