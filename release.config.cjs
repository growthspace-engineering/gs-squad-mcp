module.exports = {
  branches: [
    'main',
    {
      name: 'beta',
      prerelease: true
    }
  ],
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    [
      '@semantic-release/exec',
      {
        prepareCmd: 'npm run build'
      }
    ],
    [
      '@semantic-release/npm',
      {
        npmPublish: false,
        pkgRoot: '.'
      }
    ],
    [
      '@semantic-release/exec',
      {
        publishCmd: 'npm publish --userconfig ./.npmrc.gh --tag ${nextRelease.channel || \'latest\'}'
      }
    ],
    [
      '@semantic-release/github',
      {
        successComment: 'This PR is included in version ${nextRelease.version} 🎉\n\nThe release is available on:\n- [GitHub Releases](https://github.com/growthspace-engineering/gs-squad-mcp/releases/tag/${nextRelease.gitTag})\n- [GitHub Packages](https://github.com/growthspace-engineering/gs-squad-mcp/packages)',
        releasedLabels: false,
        assets: []
      }
    ],
    [
      '@semantic-release/git',
      {
        assets: [
          'package.json',
          'package-lock.json'
        ],
        message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}'
      }
    ]
  ]
};

