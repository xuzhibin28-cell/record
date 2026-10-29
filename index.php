<?php
/**
 * Luma Capture - Application Entry Point
 * Injects .env settings into the HTML5 application for seamless cPanel deployment.
 */

require_once __DIR__ . '/config.php';
$config = get_app_config();

$htmlPath = __DIR__ . '/index.html';
if (!file_exists($htmlPath)) {
    die('index.html template not found.');
}

$html = file_get_contents($htmlPath);

// Prepare public client-side ENV configuration
$publicEnv = [
    'appName' => $config['APP_NAME'],
    'appTagline' => $config['APP_TAGLINE'],
    'resolution' => $config['DEFAULT_RESOLUTION'],
    'fps' => (int)$config['DEFAULT_FPS'],
    'videoBitrate' => (int)$config['DEFAULT_VIDEO_BITRATE'],
    'audioBitrate' => (int)$config['DEFAULT_AUDIO_BITRATE'],
    'filenamePrefix' => $config['DEFAULT_FILENAME_PREFIX'],
    'studioMode' => (bool)$config['ENABLE_STUDIO_MODE'],
    'echoCancellation' => (bool)$config['ENABLE_ECHO_CANCELLATION'],
    'noiseSuppression' => (bool)$config['ENABLE_NOISE_SUPPRESSION'],
    'pipShape' => $config['DEFAULT_PIP_SHAPE'],
    'pipSize' => $config['DEFAULT_PIP_SIZE']
];

$envScript = '<script>window.ENV = ' . json_encode($publicEnv, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . ';</script>';

// Apply dynamic branding to HTML template
if (!empty($config['APP_NAME'])) {
    $titleText = htmlspecialchars($config['APP_NAME'] . ' — ' . $config['APP_TAGLINE']);
    $html = preg_replace('/<title>.*?<\/title>/', '<title>' . $titleText . '</title>', $html);
    $html = preg_replace('/<h1>.*?<\/h1>/', '<h1>' . htmlspecialchars($config['APP_NAME']) . '</h1>', $html);
    $html = preg_replace('/<p>Web Screen & Audio Studio<\/p>/', '<p>' . htmlspecialchars($config['APP_TAGLINE']) . '</p>', $html);
}

// Inject window.ENV before </head>
$html = str_replace('</head>', $envScript . "\n</head>", $html);

echo $html;
