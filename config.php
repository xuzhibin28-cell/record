<?php
/**
 * Luma Capture - Environment Configuration Loader
 * Lightweight, zero-dependency .env parser for cPanel and Apache environments.
 */

function load_env_file($filePath) {
    $config = [];
    if (!file_exists($filePath) || !is_readable($filePath)) {
        return $config;
    }

    $lines = file($filePath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        $line = trim($line);
        // Skip comments and empty lines
        if ($line === '' || strpos($line, '#') === 0) {
            continue;
        }

        // Split by first equals sign
        $parts = explode('=', $line, 2);
        if (count($parts) !== 2) {
            continue;
        }

        $key = trim($parts[0]);
        $value = trim($parts[1]);

        // Remove surrounding single or double quotes
        if (
            (substr($value, 0, 1) === '"' && substr($value, -1) === '"') ||
            (substr($value, 0, 1) === "'" && substr($value, -1) === "'")
        ) {
            $value = substr($value, 1, -1);
        }

        // Type conversion
        $lower = strtolower($value);
        if ($lower === 'true') {
            $value = true;
        } elseif ($lower === 'false') {
            $value = false;
        } elseif ($lower === 'null') {
            $value = null;
        } elseif (is_numeric($value)) {
            $value = strpos($value, '.') !== false ? (float)$value : (int)$value;
        }

        $config[$key] = $value;
    }

    return $config;
}

function get_app_config() {
    $envPath = __DIR__ . '/.env';
    $examplePath = __DIR__ . '/.env.example';

    $config = [];
    if (file_exists($envPath)) {
        $config = load_env_file($envPath);
    } elseif (file_exists($examplePath)) {
        $config = load_env_file($examplePath);
    }

    // Default fallbacks
    $defaults = [
        'APP_NAME' => 'Luma Capture',
        'APP_TAGLINE' => 'Web Screen & Audio Studio',
        'APP_ENV' => 'production',
        'APP_URL' => '',
        'DEFAULT_RESOLUTION' => '1080p',
        'DEFAULT_FPS' => 30,
        'DEFAULT_VIDEO_BITRATE' => 5000000,
        'DEFAULT_AUDIO_BITRATE' => 192000,
        'DEFAULT_FILENAME_PREFIX' => 'ScreenRecording',
        'ENABLE_STUDIO_MODE' => true,
        'ENABLE_ECHO_CANCELLATION' => true,
        'ENABLE_NOISE_SUPPRESSION' => true,
        'DEFAULT_PIP_SHAPE' => 'circle',
        'DEFAULT_PIP_SIZE' => 'medium'
    ];

    return array_merge($defaults, $config);
}
