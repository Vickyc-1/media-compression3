const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const sharp = require('sharp');

// Set up the app
const app = express();
const port = 3000;

// Set up multer for file upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// Serve static files
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Create uploads directory if it doesn't exist
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// Handle video trimming
app.post('/trim-video', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const startTime = parseFloat(req.body.startTime) || 0;
    const duration = parseFloat(req.body.duration) || 0;
    const shouldCompress = req.body.compress === 'true';
    const inputPath = req.file.path;
    const outputPath = `uploads/trimmed_video_${Date.now()}.mp4`;

    let command = ffmpeg(inputPath)
        .setStartTime(startTime)
        .setDuration(duration);

    if (shouldCompress) {
        command
            .videoCodec('libx264')
            .audioCodec('aac')
            .videoBitrate('1000k')
            .audioBitrate('128k');
    }

    command.output(outputPath)
        .on('end', () => {
            fs.unlinkSync(inputPath);
            res.json({
                success: true,
                path: outputPath
            });
        })
        .on('error', (err) => {
            console.error('Error:', err);
            res.status(500).json({
                success: false,
                message: 'Error processing video'
            });
        })
        .run();
});

// Handle audio trimming
app.post('/trim-audio', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const startTime = parseFloat(req.body.startTime) || 0;
    const duration = parseFloat(req.body.duration) || 0;
    const shouldCompress = req.body.compress === 'true';
    const inputPath = req.file.path;
    const outputPath = `uploads/trimmed_audio_${Date.now()}.mp3`;

    let command = ffmpeg(inputPath)
        .setStartTime(startTime)
        .setDuration(duration);

    if (shouldCompress) {
        command.audioCodec('libmp3lame')
            .audioBitrate('128k');
    }

    command.output(outputPath)
        .on('end', () => {
            fs.unlinkSync(inputPath);
            res.json({
                success: true,
                path: outputPath
            });
        })
        .on('error', (err) => {
            console.error('Error:', err);
            res.status(500).json({
                success: false,
                message: 'Error processing audio'
            });
        })
        .run();
});

// Handle image processing
app.post('/process-image', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    try {
        const { cropData, format } = req.body;
        const cropInfo = JSON.parse(cropData);
        const outputPath = `uploads/processed_image_${Date.now()}.${format}`;

        await sharp(req.file.path)
            .extract({
                left: Math.round(cropInfo.x),
                top: Math.round(cropInfo.y),
                width: Math.round(cropInfo.width),
                height: Math.round(cropInfo.height)
            })
            [format]({ quality: 80 })  // 固定质量为80
            .toFile(outputPath);

        fs.unlinkSync(req.file.path);
        res.json({
            success: true,
            path: outputPath
        });
    } catch (err) {
        console.error('Error:', err);
        res.status(500).json({
            success: false,
            message: 'Error processing image'
        });
    }
});

// Handle direct compression
app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded');
    }

    const uploadedFilePath = req.file.path;
    const fileType = path.extname(req.file.originalname).toLowerCase();

    if (fileType === '.mp4' || fileType === '.mov' || fileType === '.avi') {
        const outputFilePath = `uploads/compressed_video_${Date.now()}.mp4`;

        ffmpeg(uploadedFilePath)
            .output(outputFilePath)
            .videoCodec('libx264')
            .audioCodec('aac')
            .videoBitrate('1000k')
            .audioBitrate('128k')
            .on('end', () => {
                fs.unlinkSync(uploadedFilePath);
                const successHtml = generateSuccessHtml(outputFilePath, 'Video');
                res.send(successHtml);
            })
            .on('error', (err) => {
                console.error(err);
                res.status(500).send('Error during compression');
            })
            .run();
    } else if (fileType === '.mp3' || fileType === '.wav') {
        const outputFilePath = `uploads/compressed_audio_${Date.now()}.mp3`;

        ffmpeg(uploadedFilePath)
            .output(outputFilePath)
            .audioCodec('libmp3lame')
            .audioBitrate('128k')
            .on('end', () => {
                fs.unlinkSync(uploadedFilePath);
                const successHtml = generateSuccessHtml(outputFilePath, 'Audio');
                res.send(successHtml);
            })
            .on('error', (err) => {
                console.error(err);
                res.status(500).send('Error during compression');
            })
            .run();
    } else if (fileType === '.jpg' || fileType === '.jpeg' || fileType === '.png' || fileType === '.webp') {
        const outputFilePath = `uploads/compressed_image_${Date.now()}${fileType}`;

        sharp(uploadedFilePath)
            .jpeg({ quality: 80 })
            .toFile(outputFilePath)
            .then(() => {
                fs.unlinkSync(uploadedFilePath);
                const successHtml = generateSuccessHtml(outputFilePath, 'Image');
                res.send(successHtml);
            })
            .catch(err => {
                console.error(err);
                res.status(500).send('Error processing image');
            });
    } else {
        fs.unlinkSync(uploadedFilePath);
        res.status(400).send('Unsupported file type');
    }
});

// Generate success page HTML
function generateSuccessHtml(outputFilePath, fileType) {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Processing Success</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                max-width: 800px;
                margin: 0 auto;
                padding: 20px;
            }
            .preview-container {
                margin: 20px 0;
            }
            video, audio {
                width: 640px;
                max-width: 100%;
            }
            img {
                max-width: 100%;
                height: auto;
            }
            .button {
                display: inline-block;
                padding: 8px 16px;
                margin: 10px 5px;
                background-color: #4CAF50;
                color: white;
                text-decoration: none;
                border-radius: 4px;
                transition: background-color 0.3s;
            }
            .button:hover {
                background-color: #45a049;
            }
            .button.blue {
                background-color: #2196F3;
            }
            .button.blue:hover {
                background-color: #1976D2;
            }
        </style>
    </head>
    <body>
        <h1>${fileType} processed successfully!</h1>
        
        <div class="preview-container">
            ${getPreviewElement(outputFilePath, fileType)}
        </div>

        <a href="/${outputFilePath}" download class="button">Download Processed ${fileType}</a>
        <br>
        <a href="/" class="button blue">Back to Upload Page</a>
    </body>
    </html>
    `;
}

// Helper function to generate preview element
function getPreviewElement(filePath, fileType) {
    switch (fileType.toLowerCase()) {
        case 'video':
            return `<video controls src="/${filePath}">Your browser does not support video playback.</video>`;
        case 'audio':
            return `<audio controls src="/${filePath}">Your browser does not support audio playback.</audio>`;
        case 'image':
            return `<img src="/${filePath}" style="max-width: 100%;">`;
        default:
            return '';
    }
}

// Start the server
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
    console.log(`Visit http://localhost:${port} to use the application`);
});