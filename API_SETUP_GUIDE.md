# GLM-4V API 配置指南

## 如何获取智谱AI API密钥

### 步骤1：注册账号
1. 访问 [智谱AI开放平台](https://open.bigmodel.cn/)
2. 点击右上角"注册"创建账号
3. 完成手机号验证和实名认证

### 步骤2：创建API密钥
1. 登录后进入"控制台"或"API密钥"页面
2. 点击"创建API密钥"
3. 系统会生成一个格式为 `id.secret` 的密钥
4. **重要**：请妥善保管你的API密钥，不要泄露！

### 步骤3：配置到项目

1. 找到项目目录下的 `.env` 文件（D:\chess-ocr-website\.env）

2. 编辑文件，将密钥填入：
   ```env
   ZHIPU_API_KEY=你的实际id.secret格式的密钥
   ZHIPU_MODEL=glm-4v
   ```

3. 保存文件

4. **重启服务器**：
   ```bash
   # 在命令行按 Ctrl+C 停止服务器
   # 然后重新启动
   cd D:\chess-ocr-website
   npm start
   ```

5. 刷新浏览器页面，查看API配置状态

## 验证配置

### 方法1：查看网页状态提示
打开 http://localhost:3000，页面会显示：
- ✅ 成功：显示"GLM-4V API 已配置"
- ⚠️ 失败：显示错误信息

### 方法2：检查API测试端点
访问 http://localhost:3000/api/test-config

成功响应示例：
```json
{
  "configured": true,
  "model": "glm-4v",
  "apiKeyId": "12345678..."
}
```

失败响应示例：
```json
{
  "configured": false,
  "error": "错误原因"
}
```

## 常见问题

### Q1: API密钥格式错误
**错误信息**: `Invalid API key format. Expected format: id.secret`

**解决方法**:
- 确保密钥格式为 `id.secret`（中间有个点）
- 复制密钥时不要包含多余的空格或换行符

### Q2: API密钥无效
**错误信息**: `GLM-4V API Error: Invalid API key`

**解决方法**:
- 检查密钥是否正确复制
- 确认密钥在智谱AI平台上是否有效
- 检查账户是否有可用额度

### Q3: 识别失败
**错误信息**: `GLM-4V recognition failed`

**解决方法**:
- 检查网络连接
- 查看服务器控制台日志获取详细错误
- 系统会自动fallback到Tesseract OCR

## API费用说明

智谱AI新用户通常会获得免费额度：
- 具体额度请查看智谱AI官网
- 超出免费额度后需要充值
- GLM-4V按token计费

## 测试识别

配置成功后：

1. 在网页上选择"GLM-4V 智能识别"
2. 上传手写或打印的棋谱图片
3. 点击"开始识别"
4. 等待5-10秒获取结果

## 如果不想配置API

你可以继续使用"Tesseract OCR"识别：
- 无需API密钥
- 完全免费
- 适合标准打印体棋谱

## 技术支持

如果遇到问题：
1. 查看服务器控制台日志
2. 访问 /api/test-config 端点诊断
3. 检查 .env 文件格式
4. 确认智谱AI账户状态

---

**提示**: API密钥是敏感信息，请勿分享给他人或将 .env 文件上传到公开仓库！
