import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  outDir: '.output/wxt',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'JSON Mate',
    description: 'Inspect JSON, JSONP, and JSONL payloads with a typed viewer and toolkit.',
    homepage_url: 'https://json-mate.0o666.xyz',
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvUYe9OQ5qd1molQIB+gGiG7UDmO/hreY7QeIZfCm+27D21WFVpwVuRqBr3lDv3u+fVPGQxxE+qcytj/3gAJzyAtD9SwHChZFLM/kyik7MAoCKj9i6wVGq06FD9GK4x5gdiHxW6AgTtAFDWe/YaD65kOr184gg9WwszTZlNmfIXuw+JHVRPOmvr/V4gkcxcy43Xv+rePfTFyu7mshXlZSG1XbpWXzTc0NtEmf+SEXaxDHIDQOOY6g/IgUc5bUi+T6caMuuhDVb32Vs/gXTHgXqteuEo7OPeb+oXOMXdojzZbNyIw5UTtwjSYL88SnpSF/6bHrPJ1TDIMoxS3c9RxwlwIDAQAB',
    permissions: ['contextMenus', 'storage', 'tabs'],
    host_permissions: ['*://*/*'],
    action: {
      default_title: 'JSON Mate',
      default_icon: {
        '16': 'icons/json-mate-16.png',
        '32': 'icons/json-mate-32.png',
        '48': 'icons/json-mate-48.png'
      }
    },
    icons: {
      '16': 'icons/json-mate-16.png',
      '32': 'icons/json-mate-32.png',
      '48': 'icons/json-mate-48.png',
      '128': 'icons/json-mate-128.png'
    },
    web_accessible_resources: [
      {
        matches: ['<all_urls>'],
        resources: [
          'viewer.html',
          'transform-toolkit.html',
          'options.html',
          'assets/*',
          'chunks/*',
          'icons/*',
          'icons/**'
        ]
      }
    ]
  }
});
