# Chess Notation OCR System / 国际象棋手写记录识别系统

[English](#english) | [中文](#中文)

---

## English

A chess notation recognition system based on neural networks and OCR technology. It can automatically convert handwritten or printed chess notation images into standard PGN format.

### Features

#### Dual Recognition Engines
- **🤖 GLM-4.6V AI Recognition** (Recommended)
  - Uses Zhipu AI's latest GLM-4.6V vision-language model
  - High accuracy, supports both handwritten and printed notation
  - Understands context and chess logic
  - **Supports long games (up to 100+ moves)**
  - Requires API key configuration

- **🔍 Tesseract OCR Recognition**
  - Traditional OCR technology, no API key required
  - Suitable for standard printed notation
  - Local processing, privacy-friendly

### Core Features
- Image upload (drag & drop supported)
- Intelligent image preprocessing (grayscale, sharpen, binary threshold)
- Multi-strategy parsing (supports various notation formats)
- **Move validation** (auto-detect illegal moves)
- **Chess board visualization** (display last valid position)
- **Position navigation** (jump to any historical position)
- **Board editing** (drag pieces to correct moves, with undo support)
- **Manual editing interface** (correct recognition errors)
- Automatic standard PGN generation
- Metadata editing (White, Black, Event, Date, etc.)
- PGN file download
- Responsive design, mobile-friendly

### Tech Stack
- **Backend**: Python + Flask
- **VLM**: Zhipu GLM-4.6V Vision Model (latest)
- **OCR**: Tesseract (pytesseract, fallback)
- **Image Processing**: Pillow (PIL)
- **Frontend**: HTML5 + CSS3 + JavaScript (CDN libraries, no npm needed)
- **Chess Engine**: python-chess

## Installation

### 1. Install Python Dependencies

Ensure Python 3.7+ is installed, then:

```bash
cd D:\chess-ocr-website
pip install -r requirements.txt
```

**Note**: You also need to install Tesseract OCR separately:
- **Windows**: Download from [GitHub](https://github.com/UB-Mannheim/tesseract/wiki) and add to PATH
- **macOS**: `brew install tesseract`
- **Linux**: `sudo apt-get install tesseract-ocr`

### 2. Configure API Key

**Note**: API key is required only if you want to use GLM-4.6V recognition. Tesseract OCR doesn't need an API key.

1. Get API key from [Zhipu AI Platform](https://open.bigmodel.cn/)
2. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   (On Windows: `copy .env.example .env`)
3. Edit `.env` and add your API key:
   ```env
   ZHIPU_API_KEY=your_actual_api_key_here
   ZHIPU_MODEL=glm-4.6v
   ```

### 3. Start Server

```bash
python app.py
```

### 4. Access Website

Open [http://localhost:3000](http://localhost:3000)

## Usage

1. **Select Recognition Method**
   - **GLM-4.6V AI** (Recommended): Best for handwritten notation, supports long games
   - **Tesseract OCR**: No API key needed, good for printed notation

3. **Upload Image**
   - Click "Select Image" or drag & drop
   - Supports JPG, PNG, etc.

4. **Fill Metadata** (optional)
   - Player names, event, date, etc.

5. **Start Recognition**
   - Click "Start Recognition"
   - Wait 5-10 seconds for GLM-4.6V

6. **View Results**
   - Check original text
   - Verify extracted moves
   - View generated PGN

7. **Validate Moves** (Recommended)
   - Click "Validate Moves" button to check legality
   - System will mark illegal moves and show error messages
   - Chess board will display the last valid position

8. **Correct Moves** (if recognition errors)
   - **Method 1: Use position navigation**
     - Use navigator to jump to position before error
     - Click "Edit Board"
     - Continue playing from that position
     - Click "Generate PGN from Board" when done
   - **Method 2: Board editing**
     - Click "Edit Board" to enter edit mode
     - Drag pieces to correct positions
     - Drag back to undo last move
     - Click "Generate PGN from Board" when done
   - **Method 3: Manual editing**
     - Edit moves in "Manual Edit" area
     - Click "Regenerate PGN"

9. **Export PGN**
   - Copy to clipboard or download file

## Security

### API Key Storage

**Frontend Input**:
- Stored in browser's localStorage
- Only in your local browser
- Cleared when you clear browser data
- Rotate regularly for security

**Backend Configuration**:
- Stored in server's `.env` file
- `.env` is in `.gitignore` (won't be uploaded)
- Don't share with others

### Best Practices

- ✅ Don't save API key on public devices
- ✅ Clear saved key after using public devices
- ✅ Rotate API key regularly
- ✅ Monitor usage on Zhipu AI platform
- ❌ Don't share API key with others
- ❌ Don't commit API key to repositories

## Project Structure

```
chess-ocr-website/
├── app.py                 # Flask server & OCR logic
├── requirements.txt       # Python dependencies
├── public/                # Frontend (CDN-based, no npm needed)
│   ├── index.html         # Main page
│   ├── style.css          # Styles
│   └── script.js          # Frontend logic
├── uploads/               # Temporary uploads
└── README.md              # Documentation
```

## Compatibility

Generated PGN files are compatible with:
- Chess.com
- Lichess.org
- Chessbase
- Arena
- All PGN-compatible software

## Troubleshooting

### GLM-4.6V Issues

**Error**: `ZHIPU_API_KEY not configured`
- Solution: Make sure you've created `.env` file with correct API key
- Get API key from: https://open.bigmodel.cn/

**Error**: `GLM-4.6V API Error: Invalid API key` or `401 Authentication failed`
- Solution: Check if API key is correct
- Make sure the key is valid and has sufficient quota
- System will automatically try two authentication formats:
  - Standard format: `Bearer {api_key}`
  - Fallback format: `Bearer ZHIPU-AI:{api_key}`
- Check key format: `id.secret`
- Verify key is active on Zhipu AI platform

**Error**: `400 Image format/parsing error` or `image_url must be a valid URL`
- Solution: System automatically handles image format
- Images are automatically converted to RGB format
- Images are automatically compressed (if over 20MB)
- Images use correct data URL format: `data:image/jpeg;base64,xxxx`
- If still fails, check if image file is corrupted

**Error**: Recognition failed or timeout
- System auto-falls back to Tesseract OCR (if enabled)
- Check network connection
- Timeout is set to 120 seconds
- Check console logs for detailed errors

**Error**: Empty response content
- Check console logs for response details
- Check if `finish_reason` is `length` (indicates max_tokens limit reached)
- If truncated, consider increasing `max_tokens` or segment recognition
- System displays detailed response structure for debugging

### OCR Issues

**Problem**: Poor recognition accuracy
- Ensure clear, high-contrast images
- Try GLM-4.6V for better results

**Problem**: Slow processing
- First run downloads language pack
- Switch to GLM-4.6V (faster & more accurate)

## Future Improvements

- [ ] Batch image processing
- [ ] Multi-language support
- [ ] Quality scoring
- [ ] Auto-correction of common errors
- [ ] More image preprocessing options
- [ ] Import from existing PGN files

## License

MIT License

## Author

**xyc200602**

---

## 中文

一个基于智谱GLM-4.6V视觉大模型和OCR技术的国际象棋手写棋谱识别网站，可以将手写或打印的棋谱图片自动转换为标准的PGN格式。

### 功能特点

#### 双识别引擎
- **🤖 GLM-4.6V 智能识别**（推荐）
  - 使用智谱AI最新视觉大模型GLM-4.6V
  - 识别准确度极高，支持手写和打印体
  - 能理解上下文和棋谱逻辑
  - **支持长棋谱（100+回合）**
  - 需要配置API密钥

- **🔍 Tesseract OCR 识别**
  - 传统OCR技术，无需API密钥
  - 适合标准打印体棋谱
  - 本地处理，保护隐私

### 核心功能
- 图片上传（支持拖放）
- 智能图像预处理（灰度化、锐化、二值化）
- 多层策略解析（支持多种棋谱格式）
- **招法验证功能**（自动检测非法招法）
- **棋盘可视化**（显示最后有效局面）
- **局面回退导航**（跳转到任意历史局面）
- **棋盘编辑功能**（拖动棋子修正招法，支持撤销）
- **手动编辑功能**（可修正识别错误）
- 自动生成标准PGN格式
- 支持元数据编辑（白方、黑方、赛事、日期等）
- PGN文件下载功能
- 响应式设计，支持移动端

### 技术栈
- **后端**: Python + Flask
- **VLM**: 智谱GLM-4.6V 视觉大模型（最新版）
- **OCR**: Tesseract (pytesseract, 备用方案)
- **图像处理**: Pillow (PIL)
- **前端**: HTML5 + CSS3 + JavaScript (CDN库，无需npm)
- **国际象棋引擎**: python-chess

## 安装步骤

### 1. 安装依赖

确保已安装 Python 3.7 或更高版本

```bash
cd D:\chess-ocr-website
pip install -r requirements.txt
```

**注意**: 还需要单独安装 Tesseract OCR：
- **Windows**: 从 [GitHub](https://github.com/UB-Mannheim/tesseract/wiki) 下载并添加到PATH
- **macOS**: `brew install tesseract`
- **Linux**: `sudo apt-get install tesseract-ocr`

### 2. 配置智谱API密钥

**注意**: 只有在使用GLM-4.6V识别时才需要配置API密钥。使用Tesseract OCR无需API密钥。

1. 前往 [智谱AI开放平台](https://open.bigmodel.cn/) 注册账号并创建API密钥
2. 创建 `.env` 文件（参考 `.env.example`）：
   - Windows: 创建新文件 `.env`
   - Linux/macOS: `cp .env.example .env`
3. 编辑 `.env` 文件，填入你的API密钥：

```env
ZHIPU_API_KEY=your_actual_api_key_here
ZHIPU_MODEL=glm-4.6v
```

> **注意**: 如果不使用GLM-4.6V，可以跳过此步骤，直接使用Tesseract OCR识别。

### 3. 启动服务器

```bash
python app.py
```

### 4. 访问网站

打开浏览器访问: [http://localhost:3000](http://localhost:3000)

## 使用说明

1. **选择识别方式**
   - **GLM-4.6V 智能识别**（推荐）：适合手写和复杂棋谱，支持长棋谱，需要配置API密钥
   - **Tesseract OCR**：传统OCR方式，无需API密钥，适合标准打印体

3. **上传图片**
   - 点击"选择图片"按钮或直接拖放图片到上传区域
   - 支持常见图片格式（JPG、PNG等）

4. **填写元数据**（可选）
   - 输入白方/黑方名称
   - 填写赛事、地点、日期等信息
   - 选择对局结果

5. **开始识别**
   - 点击"开始识别"按钮
   - 等待识别完成（GLM-4.6V约需5-10秒）

6. **查看结果**
   - 查看原始识别文本
   - 确认识别出的棋谱着法
   - 查看生成的PGN格式

7. **验证招法**（推荐）
   - 点击"验证招法"按钮检查合法性
   - 系统会标记非法招法并显示错误信息
   - 棋盘会显示最后一个有效局面

8. **修正招法**（如果识别错误）
   - **方法1：使用局面回退**
     - 使用导航器跳转到错误发生前的局面
     - 点击"编辑棋盘"
     - 从该局面继续走棋修正
     - 完成后点击"从棋盘生成 PGN"
   - **方法2：棋盘编辑**
     - 点击"编辑棋盘"进入编辑模式
     - 拖动棋子到正确位置
     - 拖回原位可撤销上一步
     - 完成后点击"从棋盘生成 PGN"
   - **方法3：手动编辑**
     - 在"手动编辑着法"区域修改招法
     - 点击"重新生成 PGN"

9. **导出PGN**
   - 点击"复制 PGN"复制到剪贴板
   - 或点击"下载 PGN 文件"保存到本地

## 安全性说明

### API密钥存储

**前端输入方式**：
- API密钥保存在浏览器的localStorage中
- 仅在你的本地浏览器中存储，不会上传到服务器
- 清除浏览器数据会删除保存的密钥
- 建议定期更换API密钥以保证安全

**后端配置方式**：
- API密钥保存在服务器的 `.env` 文件中
- `.env` 文件已被 `.gitignore` 排除，不会意外提交
- 请勿将 `.env` 文件分享给他人

### 最佳实践

- ✅ 不要在公共设备上保存API密钥
- ✅ 使用完公共设备后清除保存的密钥
- ✅ 定期更换API密钥
- ✅ 监控智谱AI平台的API使用情况
- ❌ 不要将API密钥分享给他人
- ❌ 不要将API密钥提交到代码仓库

## 项目结构

```
chess-ocr-website/
├── app.py                 # Flask服务器和OCR处理逻辑
├── requirements.txt       # Python依赖配置
├── public/                # 前端静态文件（使用CDN，无需npm）
│   ├── index.html         # 主页面
│   ├── style.css          # 样式文件
│   └── script.js          # 前端交互逻辑
├── uploads/               # 临时上传文件目录
└── README.md              # 项目说明文档
```

## PGN格式说明

生成的PGN文件兼容所有主流国际象棋软件：
- Chess.com
- Lichess.org
- Chessbase
- Arena
- 其他支持PGN格式的软件

## 故障排除

### GLM-4.6V 相关问题

#### 问题：GLM-4.6V 识别失败
- **错误**: `ZHIPU_API_KEY not configured`
  - 解决：确保已创建 `.env` 文件并填入正确的API密钥
  - API密钥获取地址：https://open.bigmodel.cn/

- **错误**: `GLM-4.6V API Error: Invalid API key` 或 `401 身份验证失败`
  - 解决：检查API密钥是否正确
  - 确保密钥有效且有足够的额度
  - 系统会自动尝试两种认证格式：
    - 标准格式：`Bearer {api_key}`
    - 备用格式：`Bearer ZHIPU-AI:{api_key}`
  - 如果仍然失败，请检查API密钥格式（应该是 `id.secret` 格式）

- **错误**: `400 图片输入格式/解析错误` 或 `image_url must be a valid URL`
  - 解决：系统已自动处理图片格式
  - 图片会自动转换为RGB格式
  - 图片会自动压缩（如果超过20MB）
  - 图片使用正确的data URL格式：`data:image/jpeg;base64,xxxx`
  - 如果仍然失败，请检查图片文件是否损坏

- **错误**: 识别超时或失败
  - 检查网络连接
  - 查看控制台日志了解详细错误
  - 超时时间已设置为120秒，如果仍然超时，可能是网络问题或图片太大

- **错误**: 响应内容为空
  - 检查控制台日志中的响应详情
  - 查看 `finish_reason` 是否为 `length`（表示达到max_tokens限制）
  - 如果被截断，考虑增加 `max_tokens` 或分段识别
  - 系统会显示详细的响应结构用于调试

#### 问题：GLM-4.6V 识别效果不好
- 确保图片清晰，光线充足
- 文字与背景对比明显
- 尝试使用手动编辑功能修正
- GLM-4.6V对理解上下文很强，但图片质量仍很重要

#### 问题：长棋谱识别不完整
- GLM-4.6V 已支持长棋谱（max_tokens: 5000）
- 检查控制台是否有 `⚠️ Warning: Output may be truncated` 警告
- 如果出现截断警告，考虑：
  - 将图片分成多部分分别识别
  - 或者手动补全缺失的着法

### Tesseract OCR 相关问题

#### 问题：OCR 识别结果不准确
- 确保图片清晰，文字与背景对比明显
- 尝试裁剪图片只包含棋谱记录部分
- 调整图片亮度和对比度
- 推荐使用GLM-4.6V获得更好的识别效果

#### 问题：OCR 处理很慢
- 这是正常现象，Tesseract首次运行需要下载语言包
- 后续识别会更快
- 考虑切换到GLM-4.6V（通常更快更准确）

### 通用问题

#### 问题：无法启动服务器
- 检查端口3000是否被占用
- 确保所有依赖已正确安装：`pip install -r requirements.txt`
- 确保已安装Tesseract OCR并添加到PATH
- 查看控制台错误信息

#### 问题：上传失败
- 检查uploads目录是否存在且有写权限
- 确认上传的是图片文件

## 最新改进

- ✅ **GLM-4.6V API 调用优化**（修复认证和图片格式问题）
  - 修复401身份验证失败：自动尝试标准格式和ZHIPU-AI前缀格式
  - 修复400图片格式错误：正确使用data URL格式（`data:image/xxx;base64,xxxx`）
  - 添加详细的请求和响应日志，便于调试
  - 自动图片格式转换和压缩（超过20MB自动压缩）
  - 增强错误处理和重试机制
- ✅ **招法验证功能**（自动检测非法招法，显示最后有效局面）
- ✅ **棋盘可视化**（使用 chessboard.js 显示棋盘局面）
- ✅ **局面回退导航**（跳转到任意历史局面，支持逐步导航）
- ✅ **棋盘编辑功能**（拖动棋子修正招法，支持撤销操作）
- ✅ **升级到 GLM-4.6V**（最新视觉大模型，性能更优）
- ✅ **支持长棋谱识别**（max_tokens 提升到 5000，支持超长对局）
- ✅ **极致精简 Prompt**（token 消耗降低 95%，仅 30 tokens）
- ✅ **添加截断检测**（自动警告输出是否被截断）
- ✅ **API密钥从.env文件读取**（更安全，无需在前端输入）
- ✅ **集成智谱GLM-4.6V视觉大模型**（识别准确度大幅提升）
- ✅ 双识别引擎设计（GLM-4.6V + Tesseract OCR）
- ✅ 智能fallback机制（GLM-4.6V失败自动切换到OCR）
- ✅ 添加识别方式选择（用户可选择使用哪种引擎）
- ✅ API密钥本地存储（localStorage，方便下次使用）
- ✅ 实时API配置状态检查
- ✅ 优化前端UI（更直观的识别方式选择）
- ✅ 添加图像预处理（灰度化、锐化、二值化）
- ✅ 改进棋谱解析（多层策略，支持更多格式）

## 未来改进方向

- [ ] 支持批量图片处理
- [ ] 支持更多VLM模型（GPT-4V、Claude 3.5等）
- [ ] 添加识别结果质量评分
- [ ] 添加常见错误的自动修正
- [ ] 提供更多图像预处理选项
- [ ] 添加棋谱导入功能（从现有PGN文件导入）
- [ ] 支持多语言界面

## 许可证

MIT License

## 作者

**xyc200602**
