// @ts-check

const lightCodeTheme = require('prism-react-renderer').themes.github;
const darkCodeTheme = require('prism-react-renderer').themes.dracula;

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Cockpit MicroShift',
  tagline: 'Cockpit-hosted local MicroShift installer for one RHEL host or local libvirt guest.',
  favicon: 'img/logo.svg',

  url: 'https://turbra.github.io',
  baseUrl: '/cockpit-microshift/',
  organizationName: 'turbra',
  projectName: 'cockpit-microshift',
  trailingSlash: true,

  onBrokenLinks: 'throw',
  onBrokenAnchors: 'warn',
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'throw',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          routeBasePath: '/',
          sidebarPath: require.resolve('./sidebars.js'),
          editUrl: 'https://github.com/turbra/cockpit-microshift/edit/main/website/',
        },
        blog: false,
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      image: 'img/logo.svg',
      metadata: [
        {
          name: 'description',
          content:
            'Documentation for Cockpit MicroShift, a Cockpit-hosted local MicroShift installer for one existing RHEL host or one local libvirt guest.',
        },
      ],
      colorMode: {
        defaultMode: 'light',
        disableSwitch: false,
        respectPrefersColorScheme: true,
      },
      navbar: {
        title: 'Cockpit MicroShift',
        logo: {
          alt: 'Cockpit MicroShift',
          src: 'img/logo.svg',
        },
        items: [
          {to: '/', label: 'Docs', position: 'left'},
          {to: '/getting-started/install/', label: 'Getting Started', position: 'left'},
          {to: '/examples/', label: 'Examples', position: 'left'},
          {to: '/reference/', label: 'Reference', position: 'left'},
          {
            href: 'https://github.com/turbra/cockpit-microshift',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'light',
        links: [
          {
            title: 'Docs',
            items: [
              {label: 'Getting Started', to: '/getting-started/install/'},
              {label: 'Examples', to: '/examples/'},
              {label: 'Capabilities', to: '/concepts/capabilities/'},
              {label: 'Reference', to: '/reference/'},
              {label: 'Build Validation', to: '/project/build-validation/'},
            ],
          },
          {
            title: 'Project',
            items: [
              {label: 'Repository', href: 'https://github.com/turbra/cockpit-microshift'},
              {label: 'Issues', href: 'https://github.com/turbra/cockpit-microshift/issues'},
              {label: 'License', href: 'https://github.com/turbra/cockpit-microshift/blob/main/LICENSE'},
            ],
          },
        ],
        copyright: `Copyright ${new Date().getFullYear()} Cockpit MicroShift contributors.`,
      },
      prism: {
        theme: lightCodeTheme,
        darkTheme: darkCodeTheme,
        additionalLanguages: ['bash', 'json', 'yaml', 'powershell', 'python'],
      },
      tableOfContents: {
        minHeadingLevel: 2,
        maxHeadingLevel: 3,
      },
    }),
};

module.exports = config;
