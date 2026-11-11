import { cellsForRadius, expandRadiusSteps, toH3Index } from './h3.util';

describe('h3.util', () => {
  it('produces stable H3 index for a Damascus point', () => {
    const a = toH3Index(33.5, 36.3);
    const b = toH3Index(33.5, 36.3);
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(10);
  });

  it('returns a disk of cells covering a radius', () => {
    const cells = cellsForRadius(33.5, 36.3, 500);
    expect(cells.length).toBeGreaterThan(1);
    expect(cells).toContain(toH3Index(33.5, 36.3));
  });

  it('expands radius steps gradually to max', () => {
    const steps = expandRadiusSteps([500, 700, 800, 1000, 1200, 1300], 5000);
    expect(steps[0]).toBe(500);
    expect(steps[steps.length - 1]).toBe(5000);
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i] - steps[i - 1]).toBeLessThanOrEqual(400);
      expect(steps[i]).toBeGreaterThan(steps[i - 1]);
    }
  });
});
