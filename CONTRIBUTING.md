# Contributing to GitPlus

Thank you for contributing to GitPlus! This guide will help you get started.

## Development Setup

### Prerequisites
- Node.js 16+
- Git
- Claude CLI installed and authenticated
- npm or yarn

### Setup Steps

1. **Fork and clone the repository:**
   ```bash
   git clone https://github.com/yourusername/gitplus.git
   cd gitplus
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Build the project:**
   ```bash
   npm run build
   ```

4. **Run tests:**
   ```bash
   npm test
   ```

## Commit Guidelines

We use [Conventional Commits](https://www.conventionalcommits.org/) for consistent commit messages and automated releases.

### Commit Message Format

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Commit Types

- `feat`: New features
- `fix`: Bug fixes
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Maintenance tasks
- `ci`: CI/CD changes
- `build`: Build system changes

### Using Commitizen

We recommend using commitizen for consistent commit messages:

```bash
# Instead of git commit, use:
npm run commit
```

This will guide you through creating a properly formatted commit message.

### Examples

```bash
feat: add support for GitLab repositories
fix: resolve issue with commit message parsing
docs: update installation instructions
chore: update dependencies
```

## Release Process

GitPlus uses an automated release process with [release-please](https://github.com/googleapis/release-please):

### How It Works

1. **Development**: Make changes using conventional commits
2. **Merge to Main**: When PRs are merged to main, release-please analyzes commits
3. **Release PR**: If releasable changes are detected, a release PR is automatically created
4. **Review & Merge**: Maintainers review and merge the release PR
5. **Automatic Publishing**: Package is automatically published to npm and a GitHub release is created

### Version Bumping

Version bumps are determined by commit types:
- `feat`: Minor version bump (1.0.0 → 1.1.0)
- `fix`: Patch version bump (1.0.0 → 1.0.1)
- `feat!` or `BREAKING CHANGE`: Major version bump (1.0.0 → 2.0.0)

### Breaking Changes

For breaking changes, use either:
```bash
feat!: remove deprecated API endpoints
```

Or include `BREAKING CHANGE:` in the commit body:
```bash
feat: update API response format

BREAKING CHANGE: API responses now use snake_case instead of camelCase
```

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Writing Tests

- Write tests for new features
- Update tests when modifying existing functionality
- Ensure tests pass before submitting PRs

## Pull Request Process

1. **Create a feature branch:**
   ```bash
   git checkout -b feat/your-feature-name
   ```

2. **Make your changes** using conventional commits

3. **Test your changes:**
   ```bash
   npm run validate  # Runs typecheck and tests
   ```

4. **Push and create a PR** with:
   - Clear description of changes
   - Link to any related issues
   - Screenshots for UI changes (if applicable)

5. **Wait for review** and address any feedback

## Code Style

- Follow existing code patterns
- Use TypeScript for type safety
- Run `npm run typecheck` to ensure type correctness
- Keep functions focused and well-documented

## Getting Help

- Check existing [issues](https://github.com/neublink/gitplus/issues)
- Create a new issue for bugs or feature requests
- Ask questions in discussions

Thank you for contributing! 🚀