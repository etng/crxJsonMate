import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  outDir: '.output/wxt',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'JSON Mate',
    description: 'Inspect JSON, JSONP, and JSONL payloads with a typed viewer and toolkit.',
    homepage_url: 'https://json-mate.0o666.xyz',
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA3tzat+/ablEoMTDqNQuKDgJOKWFCFlWcYB+czhUV0ogHNEKNMuYdEGRfcekHH/3Q//wEMLYeHLE6QQTidek+cnQY/yL8z/xX55RLPyVFunmsxPn/aBMxP8sgDjaqt83SSoIj2PwtgqntoukfIRKQtCsPlMDPTz7uPvkSMd8ZL7Tl0yN/jzdk85Eoe/e53jkDvze6PPCEmqqFxDoCUkrxb9ozbEcMyo12rb26AYTDbPZM+CtUg99GWZrtaBHKp2nQ+qp/Dw4S6sFRKFkmG/cYsfZpp9wfIX90b7g2OuEg50/Sj6G4mXd9in0T9pRxG8geexBrLLq4HjetOC3hl562yQIDAQAB',
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
