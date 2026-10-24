import js from '@eslint/js'

const sharedGlobals = {
    document: 'readonly',
    window: 'readonly',
    navigator: 'readonly',
    URL: 'readonly',
    URLSearchParams: 'readonly',
    HTMLElement: 'readonly',
    Event: 'readonly',
    alert: 'readonly',
    setTimeout: 'readonly',
    clearTimeout: 'readonly',
    setInterval: 'readonly',
    clearInterval: 'readonly',
    console: 'readonly',
    process: 'readonly',
    Buffer: 'readonly',
    __dirname: 'readonly',
    require: 'readonly',
    module: 'readonly',
    exports: 'readonly',
    fetch: 'readonly',
    createImageBitmap: 'readonly',
    __filename: 'readonly'
}

export default [
    {
        ignores: ['dist/**', 'node_modules/**', 'app/assets/js/scripts/**', 'app/assets/js/privileged-ui.bundle.js']
    },
    js.configs.recommended,
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: sharedGlobals
        },
        rules: {
            'no-console': 'off',
            'no-control-regex': 'off',
            'no-async-promise-executor': 'off',
            'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }]
        }
    }
]
