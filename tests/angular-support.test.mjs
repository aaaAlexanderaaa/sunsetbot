import test from 'node:test';
import assert from 'node:assert/strict';
import { EARTH_KM } from '../src/astro.mjs';
import { cloudAngularSupport, projectedElevation, directSunShadowHeight } from '../src/angular-support.mjs';
import { coordinates, pointAlong, sectionCrossing, skyDirection, earthShadowed } from '../src/radiative-geometry.mjs';

test('spherical cloud corners project to their original section coordinate and height', () => {
  const observerHeight = 0.01, observer = [0, 0, EARTH_KM + observerHeight];
  for (const [x, phi] of [[100, 5], [-100, 175]]) {
    const elevation = projectedElevation(x, 12, observerHeight, phi), direction = skyDirection(phi, elevation);
    const point = coordinates(pointAlong(observer, direction, sectionCrossing(observer, direction, x)));
    assert.ok(Math.abs(point.x - x) < 1e-8 && Math.abs(point.height - 12) < 1e-8);
  }
});

test('shadow-clipped support retains a narrow lit cloud cap on either viewing side', () => {
  const blocks = [{ xLow: -125, xHigh: -100, heightLow: 3, heightHigh: 3.1 },
    { xLow: 50, xHigh: 75, heightLow: 0.3, heightHigh: 0.4 }];
  const observer = [0, 0, EARTH_KM], altitude = -0.833, sun = skyDirection(0, altitude);
  for (const phi of [5, 175]) {
    const support = cloudAngularSupport(blocks, 0, phi, altitude, 0.5, 85);
    for (const block of blocks) for (let i = 0; i <= 20; i++) for (let j = 0; j <= 10; j++) {
      const x = block.xLow + (block.xHigh - block.xLow) * i / 20, h = block.heightLow + (block.heightHigh - block.heightLow) * j / 10;
      const e = projectedElevation(x, h, 0, phi);
      if (e === null || e < 0.5 || e > 85) continue;
      const direction = skyDirection(phi, e), p = pointAlong(observer, direction, sectionCrossing(observer, direction, x));
      assert.equal(earthShadowed(p, sun), h < directSunShadowHeight(x, phi, altitude) - 1e-8);
      if (!earthShadowed(p, sun)) assert.ok(support.intervals.some(([a, b]) => Math.sin(e * Math.PI / 180) >= a - 1e-10 && Math.sin(e * Math.PI / 180) <= b + 1e-10));
    }
  }
});
