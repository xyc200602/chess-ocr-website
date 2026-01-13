// Global variables
let selectedFile = null;
let recognizedPGN = '';

// DOM elements
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const previewSection = document.getElementById('previewSection');
const previewImage = document.getElementById('previewImage');
const processBtn = document.getElementById('processBtn');
const loadingSection = document.getElementById('loadingSection');
const resultsSection = document.getElementById('resultsSection');

// Initialize date field with today's date
document.getElementById('date').valueAsDate = new Date();

// Load saved API key from localStorage
loadApiKey();

// Check API configuration on page load
checkApiConfig();

function loadApiKey() {
    const savedKey = localStorage.getItem('zhipu_api_key');
    if (savedKey) {
        document.getElementById('apiKey').value = savedKey;
    }
}

function saveApiKeyToStorage(apiKey) {
    if (document.getElementById('saveApiKey').checked && apiKey) {
        localStorage.setItem('zhipu_api_key', apiKey);
    }
}

function clearApiKey() {
    if (confirm('确定要清除已保存的API密钥吗？')) {
        localStorage.removeItem('zhipu_api_key');
        document.getElementById('apiKey').value = '';
        checkApiConfig();
    }
}

async function checkApiConfig() {
    const apiKey = document.getElementById('apiKey').value.trim();
    const statusSection = document.getElementById('apiStatusSection');
    const statusContent = document.getElementById('apiStatusContent');

    if (!apiKey) {
        statusContent.innerHTML = `
            <div class="api-status-warning">
                ⚠️ 未输入API密钥
                <br><br>
                <strong>两种配置方式：</strong><br>
                1. <strong>前端输入</strong>：在上方输入框直接粘贴API密钥（推荐）<br>
                2. <strong>后端配置</strong>：编辑服务器的 .env 文件<br>
                <br>
                <a href="https://open.bigmodel.cn/" target="_blank">点击获取智谱AI密钥</a>
            </div>
        `;
        statusSection.style.display = 'block';
        return;
    }

    // Validate API key format
    if (!apiKey.includes('.') || apiKey.split('.').length !== 2) {
        statusContent.innerHTML = `
            <div class="api-status-warning">
                ⚠️ API密钥格式错误
                <br><br>
                正确格式应该是：id.secret（中间有个点）
                <br>
                例如：12345678.abcdefghijklmnopqrstuvwxyz
            </div>
        `;
        statusSection.style.display = 'block';
        return;
    }

    statusContent.innerHTML = `
        <div class="api-status-success">
            ✅ 已输入API密钥: ${apiKey.substring(0, 10)}...（使用前端输入的密钥）
        </div>
    `;
    statusSection.style.display = 'block';
}

// Monitor API key input changes
document.getElementById('apiKey').addEventListener('input', () => {
    checkApiConfig();
});

// Event listeners for drag and drop
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFileSelect(files[0]);
    }
});

// File input change
fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFileSelect(e.target.files[0]);
    }
});

// Handle file selection
function handleFileSelect(file) {
    if (!file.type.startsWith('image/')) {
        alert('请选择图片文件！');
        return;
    }

    selectedFile = file;

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
        previewImage.src = e.target.result;
        previewSection.style.display = 'block';
        processBtn.disabled = false;
    };
    reader.readAsDataURL(file);
}

// Clear preview
function clearPreview() {
    selectedFile = null;
    previewImage.src = '';
    previewSection.style.display = 'none';
    fileInput.value = '';
    processBtn.disabled = true;
    resultsSection.style.display = 'none';
}

// Process image
async function processImage() {
    if (!selectedFile) {
        alert('请先选择图片！');
        return;
    }

    // Check if using GLM-4V and API key is provided
    const method = document.querySelector('input[name="method"]:checked').value;
    const apiKey = document.getElementById('apiKey').value.trim();

    if (method === 'glm' && !apiKey) {
        alert('使用GLM-4V识别需要输入API密钥！\n\n请先在上方输入框粘贴智谱AI的API密钥。');
        document.getElementById('apiKey').focus();
        return;
    }

    // Save API key to localStorage if checkbox is checked
    saveApiKeyToStorage(apiKey);

    // Show loading
    loadingSection.style.display = 'block';
    resultsSection.style.display = 'none';
    processBtn.disabled = true;

    // Prepare form data
    const formData = new FormData();
    formData.append('image', selectedFile);
    formData.append('method', method);
    formData.append('apiKey', apiKey); // Send API key to backend
    formData.append('white', document.getElementById('white').value);
    formData.append('black', document.getElementById('black').value);
    formData.append('event', document.getElementById('event').value);
    formData.append('site', document.getElementById('site').value);
    formData.append('date', document.getElementById('date').value);
    formData.append('round', document.getElementById('round').value);
    formData.append('result', document.getElementById('result').value);

    try {
        // Send to server
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        // Hide loading
        loadingSection.style.display = 'none';
        processBtn.disabled = false;

        if (result.success) {
            displayResults(result);
        } else {
            alert('识别失败: ' + result.error);
        }
    } catch (error) {
        loadingSection.style.display = 'none';
        processBtn.disabled = false;
        alert('处理图片时出错: ' + error.message);
    }
}

// Display results
function displayResults(result) {
    // Raw text
    document.getElementById('rawText').value = result.rawText;

    // Move count
    document.getElementById('moveCount').textContent = result.moveCount;

    // Moves list
    const movesList = document.getElementById('movesList');
    movesList.innerHTML = '';
    result.moves.forEach((move, index) => {
        const moveTag = document.createElement('span');
        moveTag.className = 'move-tag';
        moveTag.textContent = move;
        movesList.appendChild(moveTag);
    });

    // Fill editable moves textarea
    document.getElementById('movesEdit').value = result.moves.join(' ');

    // PGN output
    document.getElementById('pgnOutput').value = result.pgn;
    recognizedPGN = result.pgn;

    // Show results section
    resultsSection.style.display = 'block';

    // Scroll to results
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Regenerate PGN from edited moves
function regeneratePGN() {
    const movesText = document.getElementById('movesEdit').value.trim();

    if (!movesText) {
        alert('请输入着法！');
        return;
    }

    // Split moves by whitespace
    const moves = movesText.split(/\s+/).filter(m => m.length > 0);

    // Get metadata
    const metadata = {
        event: document.getElementById('event').value || '?',
        site: document.getElementById('site').value || '?',
        date: document.getElementById('date').value || new Date().toISOString().split('T')[0],
        round: document.getElementById('round').value || '?',
        white: document.getElementById('white').value || 'White',
        black: document.getElementById('black').value || 'Black',
        result: document.getElementById('result').value || '*'
    };

    // Generate PGN
    const pgn = generatePGNFromMoves(moves, metadata);

    // Update PGN output
    document.getElementById('pgnOutput').value = pgn;
    recognizedPGN = pgn;

    // Update move count
    document.getElementById('moveCount').textContent = moves.length;

    alert('PGN 已重新生成！');
}

// Generate PGN from moves array (client-side version)
function generatePGNFromMoves(moves, metadata) {
    const {
        event = '?',
        site = '?',
        date = new Date().toISOString().split('T')[0],
        round = '?',
        white = 'White',
        black = 'Black',
        result = '*'
    } = metadata;

    // PGN header
    let pgn = `[Event "${event}"]\n`;
    pgn += `[Site "${site}"]\n`;
    pgn += `[Date "${date}"]\n`;
    pgn += `[Round "${round}"]\n`;
    pgn += `[White "${white}"]\n`;
    pgn += `[Black "${black}"]\n`;
    pgn += `[Result "${result}"]\n\n`;

    // Format moves into move pairs
    let moveNumber = 1;
    let formattedMoves = [];

    for (let i = 0; i < moves.length; i += 2) {
        const whiteMove = moves[i] || '';
        const blackMove = moves[i + 1] || '';

        if (whiteMove) {
            if (blackMove) {
                formattedMoves.push(`${moveNumber}. ${whiteMove} ${blackMove}`);
            } else {
                formattedMoves.push(`${moveNumber}. ${whiteMove}`);
            }
            moveNumber++;
        }
    }

    pgn += formattedMoves.join(' ');
    if (result !== '*') {
        pgn += ' ' + result;
    }

    return pgn;
}

// Copy PGN to clipboard
function copyPGN() {
    const pgnText = document.getElementById('pgnOutput').value;
    navigator.clipboard.writeText(pgnText).then(() => {
        alert('PGN 已复制到剪贴板！');
    }).catch(err => {
        console.error('复制失败:', err);
        // Fallback: select text for manual copy
        const textarea = document.getElementById('pgnOutput');
        textarea.select();
        document.execCommand('copy');
        alert('PGN 已复制到剪贴板！');
    });
}

// Download PGN file
function downloadPGN() {
    const pgnText = document.getElementById('pgnOutput').value;
    const white = document.getElementById('white').value || 'White';
    const black = document.getElementById('black').value || 'Black';
    const filename = `【国象聯盟】 ${white} vs ${black}.pgn`;

    fetch('/download-pgn', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            pgn: pgnText,
            filename: filename
        })
    })
    .then(response => response.blob())
    .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    })
    .catch(error => {
        console.error('下载失败:', error);
        alert('下载失败，请手动复制 PGN 内容保存为文件。');
    });
}
