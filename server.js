require('dotenv').config();
const express = require('express');
const multer = require('multer');
const Tesseract = require('tesseract.js');
const axios = require('axios');
const FormData = require('form-data');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const sharp = require('sharp');
const { Chess } = require('chess.js');

const app = express();
const PORT = 3000;

// Enable CORS
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage: storage });

// Chess notation parser with improved pattern matching
class ChessNotationParser {
  constructor() {
    // Chess piece letters
    this.pieces = ['K', 'Q', 'R', 'B', 'N'];

    // File and rank notation
    this.files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    this.ranks = ['1', '2', '3', '4', '5', '6', '7', '8'];

    // Build comprehensive move patterns
    this.buildPatterns();
  }

  buildPatterns() {
    // Castling
    this.castlingPattern = /(O-O-O|O-O|0-0-0|0-0)/g;

    // Regular moves: [Piece][disambiguator]?x?[destination][promotion]?[+]?
    const piece = '[KQRBN]?';
    const disambiguator = '[a-h]?[1-8]?';
    const capture = 'x?';
    const destination = '[a-h][1-8]';
    const promotion = '(=[QRBN])?';
    const checkMate = '[+#]?';

    this.movePattern = new RegExp(
      `(${piece}${disambiguator}${capture}${destination}${promotion}${checkMate})`,
      'g'
    );

    // Numbered move pattern: "1. e4 e5" or "1.e4 e5"
    this.numberedMovePattern = /(\d+)\.\s*([^\d]+)/g;
  }

  async preprocessImage(imagePath) {
    try {
      const outputPath = imagePath.replace(/\.[^.]+$/, '_processed.png');

      // Apply image preprocessing
      await sharp(imagePath)
        .grayscale() // Convert to grayscale
        .normalize() // Normalize contrast
        .sharpen() // Sharpen the image
        .threshold(128) // Apply threshold for better OCR
        .toFile(outputPath);

      return outputPath;
    } catch (error) {
      console.error('Image preprocessing failed:', error);
      return imagePath; // Return original if preprocessing fails
    }
  }

  parseText(text) {
    console.log('Starting text parsing...');
    console.log('Original text length:', text.length);

    // Step 1: Clean and normalize text
    text = this.cleanText(text);
    console.log('Cleaned text:', text.substring(0, 200));

    // Step 2: Try multiple parsing strategies
    let moves = [];

    // Strategy 1: Extract numbered moves
    moves = this.extractNumberedMoves(text);
    if (moves.length > 0) {
      console.log(`Extracted ${moves.length} moves using numbered move pattern`);
      return this.validateAndCleanMoves(moves);
    }

    // Strategy 2: Extract all chess moves
    moves = this.extractAllMoves(text);
    if (moves.length > 0) {
      console.log(`Extracted ${moves.length} moves using all moves pattern`);
      return this.validateAndCleanMoves(moves);
    }

    // Strategy 3: Fallback - look for castling and simple squares
    moves = this.extractSimpleMoves(text);
    console.log(`Extracted ${moves.length} moves using simple pattern`);
    return this.validateAndCleanMoves(moves);
  }

  cleanText(text) {
    // Convert to consistent case
    text = text.toUpperCase();

    // Replace common OCR errors
    const replacements = [
      [/０/g, '0'], // Full-width digits
      [/１/g, '1'],
      [/２/g, '2'],
      [/３/g, '3'],
      [/４/g, '4'],
      [/５/g, '5'],
      [/６/g, '6'],
      [/７/g, '7'],
      [/８/g, '8'],
      [/９/g, '9'],
      [/，/g, ','],
      [/\s+/g, ' '], // Normalize whitespace
    ];

    for (const [pattern, replacement] of replacements) {
      text = text.replace(pattern, replacement);
    }

    // Keep only chess-relevant characters
    text = text.replace(/[^A-Z0-9\.\-\+\#=\s\/xO]/g, ' ');

    return text.trim();
  }

  extractNumberedMoves(text) {
    const moves = [];
    let match;

    // Reset regex
    this.numberedMovePattern.lastIndex = 0;

    while ((match = this.numberedMovePattern.exec(text)) !== null) {
      const moveText = match[2];
      // Split by spaces and filter
      const individualMoves = moveText
        .split(/\s+/)
        .map(m => m.trim())
        .filter(m => m.length > 0);

      for (const move of individualMoves) {
        if (this.isValidMove(move)) {
          moves.push(move);
        }
      }
    }

    return moves;
  }

  extractAllMoves(text) {
    const moves = [];
    let match;

    // Reset regex
    this.movePattern.lastIndex = 0;

    while ((match = this.movePattern.exec(text)) !== null) {
      moves.push(match[0]);
    }

    // Also check for castling
    this.castlingPattern.lastIndex = 0;
    while ((match = this.castlingPattern.exec(text)) !== null) {
      moves.push(match[0]);
    }

    return moves;
  }

  extractSimpleMoves(text) {
    const moves = [];

    // Look for castling
    const castling = text.match(this.castlingPattern);
    if (castling) {
      moves.push(...castling);
    }

    // Look for simple square patterns (e.g., "e4", "Nf3")
    const simplePattern = /[KQRBN]?[a-h][1-8][+#]?/g;
    const simpleMoves = text.match(simplePattern);
    if (simpleMoves) {
      moves.push(...simpleMoves);
    }

    return moves;
  }

  isValidMove(move) {
    // Check if it's castling
    if (/^(O-O|O-O-O|0-0|0-0-0)$/.test(move)) return true;

    // Check if it matches the general move pattern
    return this.movePattern.test(move);
  }

  validateAndCleanMoves(moves) {
    // Remove duplicates while preserving order
    const uniqueMoves = [];
    const seen = new Set();

    for (const move of moves) {
      const normalized = move.toUpperCase().trim();
      if (normalized && !seen.has(normalized)) {
        seen.add(normalized);
        uniqueMoves.push(normalized);
      }
    }

    return uniqueMoves;
  }

  generatePGN(moves, metadata = {}) {
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
}

// GLM-4.6V Vision Service
class GLMChessRecognizer {
  constructor(apiKey = null) {
    // 使用预配置的API密钥（不从环境变量或前端获取）
    this.apiKey = '8ac174f30d1a45e7b6537366d6e25a28.bTd4aAMXloIXmedQ';
    this.model = 'glm-4.6v';  // Updated to glm-4.6v
    this.apiUrl = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
  }

  // Generate JWT token for Zhipu AI API
  generateToken(customApiKey = null) {
    const keyToUse = customApiKey || this.apiKey;

    if (!keyToUse) {
      throw new Error('ZHIPU_API_KEY not configured');
    }

    try {
      const [id, secret] = keyToUse.split('.');
      if (!id || !secret) {
        throw new Error('Invalid API key format. Expected: id.secret');
      }

      // Use seconds, not milliseconds!
      const now = Math.floor(Date.now() / 1000);
      const payload = {
        api_key: id,         // Only the ID part, not the full key!
        exp: now + 3600,     // Token expires in 1 hour (in seconds)
        timestamp: now       // Current time in seconds
      };

      console.log('JWT Payload:', {
        api_key: id,
        exp: payload.exp,
        exp_date: new Date(payload.exp * 1000).toISOString(),
        timestamp: payload.timestamp,
        timestamp_date: new Date(payload.timestamp * 1000).toISOString()
      });

      const token = jwt.sign(payload, secret, { algorithm: 'HS256' });
      console.log('JWT Token generated (first 50 chars):', token.substring(0, 50) + '...');

      // Decode token to verify
      const decoded = jwt.decode(token);
      console.log('Decoded JWT:', decoded);

      return token;
    } catch (error) {
      console.error('Failed to generate token:', error);
      throw new Error(`Token generation failed: ${error.message}`);
    }
  }

  async recognizeChessNotation(imagePath, customApiKey = null) {
    // 使用预配置的API密钥，忽略前端传来的customApiKey
    if (!this.apiKey) {
      throw new Error('ZHIPU_API_KEY not configured.');
    }

    try {
      console.log('Calling GLM-4.6V API...');
      console.log('Using model:', this.model);

      // 使用预配置的API密钥
      const authorization = `Bearer ${this.apiKey}`;
      console.log('Using pre-configured API key');

      // Convert image to base64
      const imageBuffer = fs.readFileSync(imagePath);
      const base64Image = imageBuffer.toString('base64');
      console.log('Image converted to base64, size:', imageBuffer.length);

      // Prepare the prompt for chess notation recognition
      // Minimal prompt for maximum efficiency
      const prompt = `识别国际象棋棋谱，直接输出招法。格式示例：1. e4 e5 2. Nf3 Nc6`;

      // Prepare API request
      const requestData = {
        model: this.model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`
                }
              },
              {
                type: 'text',
                text: prompt
              }
            ]
          }
        ],
        temperature: 0.1,
        max_tokens: 5000,  // Increased to handle very long games (100+ moves)
        thinking: {
          type: 'disabled'  // Disable thinking mode for faster response
        }
      };

      console.log('Sending request to GLM-4.6V API...');
      console.log('Request data:', JSON.stringify(requestData, null, 2));

      // Make API request with direct API key
      const response = await axios.post(this.apiUrl, requestData, {
        headers: {
          'Authorization': authorization,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      console.log('Response status:', response.status);
      console.log('Response data:', JSON.stringify(response.data, null, 2));

      // Extract the response
      if (response.data && response.data.choices && response.data.choices.length > 0) {
        const content = response.data.choices[0].message.content;
        console.log('GLM-4.6V Response:', content);

        // Check if output was truncated
        if (response.data.usage) {
          const { completion_tokens, total_tokens } = response.data.usage;
          if (completion_tokens >= 4750) {  // 95% of max_tokens (5000)
            console.warn(`⚠️ Warning: Output may be truncated (${completion_tokens} tokens used)`);
            console.warn('   Consider using shorter game records or implementing multi-page recognition');
          }
          console.log(`Token usage: ${completion_tokens} completion + ${response.data.usage.prompt_tokens} prompt = ${total_tokens} total`);
        }

        // Extract moves from the response
        const moves = this.extractMoves(content);
        console.log('Extracted moves:', moves);

        return {
          success: true,
          text: content,
          moves: moves,
          usage: response.data.usage
        };
      } else {
        throw new Error('Invalid response from GLM-4.6V API');
      }

    } catch (error) {
      console.error('GLM-4.6V API Error Details:');
      console.error('Status:', error.response?.status);
      console.error('Status Text:', error.response?.statusText);
      console.error('Data:', error.response?.data);
      console.error('Message:', error.message);

      if (error.response?.data?.error) {
        throw new Error(`GLM-4.6V API Error: ${error.response.data.error.message || JSON.stringify(error.response.data.error)}`);
      }

      throw new Error(`GLM-4.6V recognition failed: ${error.message}`);
    }
  }

  extractMoves(text) {
    console.log('Original text for extraction:', text);

    // Clean up the text first
    text = text.trim()
      // Remove common explanatory text
      .replace(/^(这里是|以下是|棋谱|对局|记录).*/gim, '')
      .replace(/(结果|胜负|结束|完).*/gim, '')
      // Normalize whitespace and line breaks
      .replace(/[\r\n]+/g, ' ')
      // Remove explanations in parentheses
      .replace(/\([^)]*\)/g, '')
      .trim();

    console.log('Cleaned text:', text);

    const moves = [];

    // Strategy 1: Extract numbered moves (e.g., "1. f4 d5 2. Nf3 Nf6")
    // This pattern handles multi-line sequences
    const numberedMoves = text.match(/(\d+\.\s*[^0-9]+?)(?=\s+\d+\.|$)/gs);

    if (numberedMoves) {
      console.log(`Found ${numberedMoves.length} numbered move blocks`);

      numberedMoves.forEach((block, index) => {
        console.log(`\nProcessing block ${index + 1}:`, block);

        // Remove the move number and extract individual moves
        const moveText = block.replace(/^\d+\.\s*/, '').trim();
        console.log(`Move text: "${moveText}"`);

        // Split by whitespace and filter valid moves
        const tokens = moveText.split(/\s+/);
        for (const token of tokens) {
          const cleanMove = token.trim();
          // Remove trailing punctuation
          const finalMove = cleanMove.replace(/[.,，。、]+$/, '');

          if (finalMove && this.isValidChessMove(finalMove)) {
            moves.push(finalMove);
            console.log(`  ✓ Added: ${finalMove}`);
          } else if (cleanMove && cleanMove.length > 0) {
            console.log(`  ✗ Skipped: "${cleanMove}" (invalid)`);
          }
        }
      });
    }

    // If we got moves from numbered format, validate and return
    if (moves.length > 0) {
      console.log(`\n✅ Successfully extracted ${moves.length} moves from numbered notation`);
      return moves;
    }

    // Strategy 2: Extract all chess moves using pattern matching
    console.log('\nNo numbered moves found, extracting all valid moves...');
    const chessMovePattern = /\b(?:O-O-O|O-O|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?)\b/g;
    const allMatches = text.match(chessMovePattern);

    if (allMatches) {
      console.log(`Found ${allMatches.length} potential moves:`, allMatches);
      for (const m of allMatches) {
        const cleanMove = m.replace(/[.,，。、]+$/, '');
        if (this.isValidChessMove(cleanMove)) {
          moves.push(cleanMove);
        }
      }
    }

    console.log(`\nFinal extracted moves (${moves.length} total):`, moves);
    return moves;
  }

  isValidChessMove(move) {
    if (!move || move.length === 0) return false;

    // Check for castling (both notations)
    if (/^(O-O|O-O-O|0-0|0-0-0)$/.test(move)) {
      console.log(`  Castling detected: ${move}`);
      return true;
    }

    // Clean up the move - remove any trailing punctuation
    move = move.replace(/[.,，。、]+$/, '').trim();

    // Check for regular moves
    // Format: [Piece][disambiguator?][capture?][destination][promotion?][check/mate?]
    // Examples: e4, Nf3, Bb5, exd5, Nfxe4, O-O, h8=Q, e5#, d4+
    const movePattern = /^[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?$/;

    const isValid = movePattern.test(move);
    if (!isValid && move.length > 0) {
      console.log(`  Invalid move format: "${move}"`);
    }

    return isValid;
  }
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Test API configuration endpoint
app.get('/api/test-config', (req, res) => {
  const apiKey = process.env.ZHIPU_API_KEY;

  if (!apiKey) {
    return res.json({
      configured: false,
      error: 'ZHIPU_API_KEY not found in .env file'
    });
  }

  if (apiKey === 'your_api_key_here' || apiKey === 'your_api_key_here') {
    return res.json({
      configured: false,
      error: 'ZHIPU_API_KEY is still set to placeholder value. Please edit .env file with your actual API key.'
    });
  }

  try {
    const [id, secret] = apiKey.split('.');
    if (!id || !secret) {
      return res.json({
        configured: false,
        error: 'Invalid API key format. Expected format: id.secret'
      });
    }

    return res.json({
      configured: true,
      model: process.env.ZHIPU_MODEL || 'glm-4v',
      apiKeyId: id.substring(0, 8) + '...' // Show partial ID
    });
  } catch (error) {
    return res.json({
      configured: false,
      error: error.message
    });
  }
});

// Validate chess moves using chess.js library
app.post('/api/validate-moves', (req, res) => {
  try {
    const { moves } = req.body;

    if (!moves || !Array.isArray(moves)) {
      return res.status(400).json({
        success: false,
        error: 'Moves array is required'
      });
    }

    const chess = new Chess();
    const validationResults = [];
    const validPositions = []; // Store all valid positions
    let lastValidFen = chess.fen(); // Store initial position
    let foundInvalid = false; // Flag to track if we've hit an invalid move

    // Save initial position
    validPositions.push({
      moveIndex: -1,
      fen: chess.fen(),
      move: '初始局面'
    });

    moves.forEach((move, index) => {
      const result = {
        move: move,
        moveNumber: index + 1,
        isValid: false,
        error: null
      };

      // Only try to make the move if we haven't found an invalid move yet
      if (!foundInvalid) {
        try {
          const moveResult = chess.move(move);

          if (moveResult) {
            result.isValid = true;
            lastValidFen = chess.fen(); // Update last valid position
            // Save this valid position
            validPositions.push({
              moveIndex: index,
              fen: chess.fen(),
              move: move
            });
          } else {
            result.isValid = false;
            result.error = 'Invalid move';
            foundInvalid = true; // Stop processing after first invalid move
          }
        } catch (error) {
          result.isValid = false;
          result.error = error.message;
          foundInvalid = true; // Stop processing after first error
        }
      } else {
        // Mark all subsequent moves as invalid without trying to execute them
        result.isValid = false;
        result.error = 'Skipped (previous move was invalid)';
      }

      validationResults.push(result);
    });

    // Count valid and invalid moves
    const validMoves = validationResults.filter(r => r.isValid);
    const invalidMoves = validationResults.filter(r => !r.isValid);

    return res.json({
      success: true,
      validation: validationResults,
      validPositions: validPositions, // Send all valid positions to frontend
      summary: {
        total: moves.length,
        valid: validMoves.length,
        invalid: invalidMoves.length,
        lastValidFen: lastValidFen,
        isComplete: chess.isGameOver(),
        result: chess.isCheckmate() ? (chess.turn() === 'w' ? '0-1' : '1-0') :
                chess.isDraw() ? '1/2-1/2' : '*'
      }
    });
  } catch (error) {
    console.error('Validation error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Generate PGN from board position (FEN)
app.post('/api/fen-to-pgn', (req, res) => {
  try {
    const { fen, moves } = req.body;

    if (!fen) {
      return res.status(400).json({
        success: false,
        error: 'FEN is required'
      });
    }

    const chess = new Chess(fen);

    // If moves provided, try to reconstruct the game
    if (moves && Array.isArray(moves)) {
      const tempChess = new Chess();
      const reconstructedMoves = [];

      for (const move of moves) {
        const result = tempChess.move(move);
        if (result) {
          reconstructedMoves.push(move);
        }
      }

      return res.json({
        success: true,
        pgn: tempChess.pgn(),
        fen: tempChess.fen(),
        moves: reconstructedMoves
      });
    }

    // Just return current position PGN
    return res.json({
      success: true,
      pgn: chess.pgn() || `* (FEN: ${fen})`,
      fen: fen,
      moves: chess.history()
    });
  } catch (error) {
    console.error('FEN to PGN error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/upload', upload.single('image'), async (req, res) => {
  try {
    console.log('\n=== Upload Request ===');
    console.log('Body keys:', Object.keys(req.body));
    console.log('Method:', req.body.method);

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const imagePath = req.file.path;
    const method = req.body.method || 'glm'; // 'ocr' or 'glm'
    const parser = new ChessNotationParser();

    let moves = [];
    let rawText = '';
    let confidence = 0;

    if (method === 'glm') {
      // Use GLM-4.6V for recognition
      console.log('Using GLM-4.6V for chess notation recognition...');

      console.log('✅ Using pre-configured API key, creating GLM recognizer...');
      const glmRecognizer = new GLMChessRecognizer();

      try {
        console.log('📡 Starting GLM-4.6V recognition...');
        const result = await glmRecognizer.recognizeChessNotation(imagePath);
        moves = result.moves;
        rawText = result.text;
        console.log(`✅ GLM-4.6V extracted ${moves.length} moves`);
      } catch (glmError) {
        console.error('❌ GLM-4.6V failed, falling back to OCR:', glmError.message);
        console.error('Error stack:', glmError.stack);
        // Fall back to OCR if GLM-4.6V fails
        console.log('Falling back to Tesseract OCR...');

        const processedImagePath = await parser.preprocessImage(imagePath);
        const whitelist = '0123456789abcdefghijklmnopqrstuvwxyzKQRBNx+-=O.#?';

        const ocrResult = await Tesseract.recognize(
          processedImagePath,
          'eng',
          {
            logger: m => {
              if (m.status === 'recognizing text') {
                console.log(`OCR Progress: ${(m.progress * 100).toFixed(0)}%`);
              }
            },
            parameters: {
              tessedit_char_whitelist: whitelist,
              tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
              preserve_interword_spaces: '1',
            }
          }
        );

        rawText = ocrResult.data.text;
        confidence = ocrResult.data.confidence;
        moves = parser.parseText(rawText);

        // Clean up processed image
        if (processedImagePath !== imagePath) {
          try {
            fs.unlinkSync(processedImagePath);
          } catch (e) {
            console.error('Cleanup error:', e);
          }
        }
      }
    } else {
      // Use traditional OCR
      console.log('Using Tesseract OCR for recognition...');

      // Preprocess image
      console.log('Preprocessing image...');
      const processedImagePath = await parser.preprocessImage(imagePath);
      console.log('Image preprocessed:', processedImagePath);

      // Perform OCR
      console.log('Starting OCR recognition...');
      const whitelist = '0123456789abcdefghijklmnopqrstuvwxyzKQRBNx+-=O.#?';

      const { data: { text, confidence: ocrConfidence } } = await Tesseract.recognize(
        processedImagePath,
        'eng',
        {
          logger: m => {
            if (m.status === 'recognizing text') {
              console.log(`OCR Progress: ${(m.progress * 100).toFixed(0)}%`);
            }
          },
          parameters: {
            tessedit_char_whitelist: whitelist,
            tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
            preserve_interword_spaces: '1',
          }
        }
      );

      rawText = text;
      confidence = ocrConfidence;
      console.log('OCR Confidence:', confidence);
      console.log('OCR Raw Result:', text);

      // Parse the chess notation
      moves = parser.parseText(text);
      console.log('Parsed moves:', moves);

      // Clean up processed image
      try {
        if (processedImagePath !== imagePath) {
          fs.unlinkSync(processedImagePath);
        }
      } catch (cleanupError) {
        console.error('Cleanup error:', cleanupError);
      }
    }

    // Get metadata from request body
    const metadata = {
      event: req.body.event || '?',
      site: req.body.site || '?',
      date: req.body.date || new Date().toISOString().split('T')[0],
      round: req.body.round || '?',
      white: req.body.white || 'White',
      black: req.body.black || 'Black',
      result: req.body.result || '*'
    };

    // Generate PGN
    const pgn = parser.generatePGN(moves, metadata);

    // Clean up uploaded file
    try {
      fs.unlinkSync(imagePath);
    } catch (cleanupError) {
      console.error('Cleanup error:', cleanupError);
    }

    res.json({
      success: true,
      rawText: rawText,
      moves: moves,
      pgn: pgn,
      moveCount: moves.length,
      confidence: confidence,
      method: method
    });

  } catch (error) {
    console.error('Error processing image:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.stack
    });
  }
});

app.post('/download-pgn', (req, res) => {
  const { pgn, filename } = req.body;

  if (!pgn) {
    return res.status(400).json({ error: 'No PGN content provided' });
  }

  const defaultFilename = filename || 'chess-game.pgn';

  // Encode filename for proper download
  const encodedFilename = encodeURIComponent(defaultFilename);

  res.setHeader('Content-Type', 'application/x-chess-pgn');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFilename}`);
  res.send(pgn);
});

app.listen(PORT, () => {
  console.log(`Chess OCR Server running on http://localhost:${PORT}`);
  console.log('Upload your handwritten chess notation images to convert them to PGN format!');
});
