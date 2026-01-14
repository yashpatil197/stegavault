// --- STATE VARIABLES ---
let mode = 'text'; // 'text' or 'file'
let coverImageLoaded = false;
let secretFileLoaded = false;
let secretFileBuffer = null;
let secretFileName = "";

// --- NAVIGATION & TABS ---

function showApp(action) {
    document.getElementById('landing-page').classList.add('hidden');
    document.getElementById('app-container').classList.remove('hidden');
    document.getElementById('navbar').classList.remove('hidden');

    document.getElementById('card-encode').classList.add('hidden-card');
    document.getElementById('card-decode').classList.add('hidden-card');

    if(action === 'encode') {
        document.getElementById('card-encode').classList.remove('hidden-card');
        document.getElementById('card-encode').style.display = 'flex';
    } else {
        document.getElementById('card-decode').classList.remove('hidden-card');
        document.getElementById('card-decode').style.display = 'flex';
    }
}

function goHome() {
    location.reload();
}

function switchTab(selectedMode) {
    mode = selectedMode;
    
    // UI Updates
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');

    if (mode === 'text') {
        document.getElementById('input-text-section').classList.remove('hidden');
        document.getElementById('input-file-section').classList.add('hidden');
    } else {
        document.getElementById('input-text-section').classList.add('hidden');
        document.getElementById('input-file-section').classList.remove('hidden');
    }
    
    checkCapacity(); // Re-calculate capacity based on new mode
}


// --- UPLOAD HANDLERS ---

document.getElementById('upload-cover').addEventListener('change', (e) => handleImageUpload(e.target.files[0], 'preview-cover', true));
document.getElementById('upload-decode').addEventListener('change', (e) => handleImageUpload(e.target.files[0], 'preview-decode', false));

document.getElementById('upload-secret').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if(!file) return;
    secretFileName = file.name;
    const reader = new FileReader();
    reader.onload = function(evt) {
        secretFileBuffer = evt.target.result; // ArrayBuffer
        secretFileLoaded = true;
        document.getElementById('file-info').innerText = `Selected: ${file.name} (${formatBytes(file.size)})`;
        checkCapacity();
    };
    reader.readAsArrayBuffer(file);
});

// Text Area Capacity Check
document.getElementById('secret-text').addEventListener('input', checkCapacity);


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
    if (!coverImageLoaded) return;
    
    const img = document.getElementById('preview-cover');
    const totalBitsAvailable = (img.naturalWidth * img.naturalHeight) * 3;
    
    let requiredBits = 0;

    if (mode === 'text') {
        const text = document.getElementById('secret-text').value;
        if(text.length === 0) return;
        // Text length * 8 bits + Overhead for header
        requiredBits = (text.length * 8) + 800; 
    } else {
        if (!secretFileLoaded) return;
        requiredBits = (secretFileBuffer.byteLength * 8) + 800;
    }

    const percent = (requiredBits / totalBitsAvailable) * 100;
    const fill = document.getElementById('capacity-fill');
    const text = document.getElementById('capacity-text');
    const btn = document.getElementById('encode-btn');

    fill.style.width = percent + "%";
    text.innerText = `${percent.toFixed(2)}% Capacity Used`;

    if (percent > 100) {
        fill.style.background = "red";
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


// --- CORE ENGINE ---
// We unify Text and File handling by converting Text to Uint8Array (bytes) first.

document.getElementById('encode-btn').addEventListener('click', encodeProcess);
document.getElementById('decode-btn').addEventListener('click', decodeProcess);

function encodeProcess() {
    const password = document.getElementById('pass-encode').value;
    const img = document.getElementById('preview-cover');
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0);
    
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imgData.data;

    // 1. PREPARE PAYLOAD (Convert everything to Bytes)
    let payloadBuffer;
    let typeHeader = ""; // 'txt' or 'file'
    let nameHeader = ""; 

    if (mode === 'text') {
        const text = document.getElementById('secret-text').value;
        const encoder = new TextEncoder();
        payloadBuffer = encoder.encode(text); // Converts string to Uint8Array
        typeHeader = "txt";
        nameHeader = "msg"; // Dummy name for text
    } else {
        payloadBuffer = new Uint8Array(secretFileBuffer);
        typeHeader = "file";
        nameHeader = secretFileName;
    }

    // 2. CREATE HEADER: type|name|length|
    const header = `${typeHeader}|${nameHeader}|${payloadBuffer.length}|`;
    
    // 3. ENCRYPT & BUILD BINARY STREAM
    let binaryStream = "";
    
    // Convert Header to binary
    for (let i = 0; i < header.length; i++) {
        binaryStream += header.charCodeAt(i).toString(2).padStart(8, '0');
    }

    // Convert Payload to binary (with XOR Encryption)
    for (let i = 0; i < payloadBuffer.length; i++) {
        let byte = payloadBuffer[i];
        if(password) {
            byte = byte ^ password.charCodeAt(i % password.length);
        }
        binaryStream += byte.toString(2).padStart(8, '0');
    }

    // 4. EMBED IN PIXELS
    let dataIndex = 0;
    for (let i = 0; i < binaryStream.length; i++) {
        if ((dataIndex + 1) % 4 === 0) dataIndex++; // Skip Alpha
        
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
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0);

    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imgData.data;

    let binaryStream = "";
    let extractedChars = "";
    let headerParts = [];
    let payloadLen = 0;
    let type = "";
    let fileName = "";
    let metadataRead = false;
    let pixelIdx = 0;

    // 1. EXTRACT HEADER (Look for 3 pipes: type|name|size|)
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
                
                // We expect 3 parts: type, name, size
                if (headerParts.length === 3) {
                    type = headerParts[0]; // 'txt' or 'file'
                    fileName = headerParts[1];
                    payloadLen = parseInt(headerParts[2]);
                    metadataRead = true;
                }
            }
        }
    }

    // 2. EXTRACT PAYLOAD BYTES
    const resultBytes = new Uint8Array(payloadLen);
    let currentByte = 0;
    binaryStream = ""; 

    while (currentByte < payloadLen && pixelIdx < pixels.length) {
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

    // 3. DISPLAY RESULT BASED ON TYPE
    document.getElementById('result-area').style.display = 'block';
    const textResult = document.getElementById('text-result');
    const fileResult = document.getElementById('file-result');

    // Hide both initially
    textResult.classList.add('hidden');
    fileResult.classList.add('hidden');

    if (type === 'txt') {
        // Decode bytes back to string
        const decoder = new TextDecoder();
        const decodedText = decoder.decode(resultBytes);
        textResult.innerText = decodedText;
        textResult.classList.remove('hidden');
    } else {
        // Handle File Download
        document.getElementById('found-filename').innerText = fileName;
        fileResult.classList.remove('hidden');
        
        document.getElementById('download-secret-btn').onclick = function() {
            const blob = new Blob([resultBytes], {type: "application/octet-stream"});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            a.click();
        };
    }
}
