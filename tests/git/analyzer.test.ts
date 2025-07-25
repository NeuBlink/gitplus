import { ChangeAnalyzer } from '../../src/git/analyzer';

// Simple test to verify the ChangeAnalyzer can be instantiated
describe('ChangeAnalyzer', () => {
  it('should be instantiable', () => {
    const mockGitClient = {} as any;
    const analyzer = new ChangeAnalyzer(mockGitClient);
    expect(analyzer).toBeDefined();
  });

  it('should have analyzeChanges method', () => {
    const mockGitClient = {} as any;
    const analyzer = new ChangeAnalyzer(mockGitClient);
    expect(typeof analyzer.analyzeChanges).toBe('function');
  });
});