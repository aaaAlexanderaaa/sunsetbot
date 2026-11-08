#!/usr/bin/env python3
"""Normalize the Sep/Oct weather calendar without retrieving observed labels."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path

from reanalysis_grib import GribArchive, PARAMETERS, STANDARD_GRAVITY, file_hash

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'research/experiments/scattering-weather-inputs')
    args = parser.parse_args()
    calendar_path = ROOT / 'research/experiments/scattering-validation-calendar/weather-selection.json'
    calendar = json.loads(calendar_path.read_text())
    plan_path = ROOT / 'config/reanalysis/shanghai-scattering-validation-son.json'
    plan = json.loads(plan_path.read_text())
    dependencies = [(ROOT / 'var/reanalysis/scattering-validation-data', job['id']) for job in plan['jobs']]
    dependencies += [(ROOT / 'var/reanalysis/validation-data', name) for name in [
        'validation-pressure-2023-08', 'validation-layers-2023-08', 'validation-terrain']]
    paths, receipts = [], []
    for directory, name in dependencies:
        receipt = json.loads((directory / (name + '.json')).read_text())
        path = directory / (name + '.grib')
        if file_hash(path) != receipt['sha256'] or path.stat().st_size != receipt['bytes']:
            raise ValueError('Official download hash/length changed: ' + name)
        paths.append(path)
        # Task identifiers and account configuration have no role in public data provenance.
        receipts.append({key: receipt[key] for key in ['dataset', 'request', 'file', 'bytes', 'sha256', 'downloaded_at']})
    weather_times, aerosol_times, points_by_time = set(), set(), {}
    for case in calendar['cases']:
        if 'observedCase' in case or 'observedGrade' in case:
            raise ValueError('Weather preparation must retain a label-free calendar')
        weather_times.update(case['hours'])
        aerosol_times.update(case['aerosolHours'])
        for when in set(case['hours'] + case['aerosolHours']):
            if when in points_by_time and points_by_time[when] != case['points']:
                raise ValueError('Distinct sections share a sampled input hour')
            points_by_time[when] = case['points']
    terrain_time = int(datetime(2023, 6, 10, tzinfo=timezone.utc).timestamp())
    wanted = {parameter: set() for parameter in PARAMETERS}
    for parameter in [248, 186, 187, 188]:
        wanted[parameter] = weather_times
    wanted[129] = weather_times | {terrain_time}
    wanted[210207] = aerosol_times
    archive = GribArchive(paths, wanted, sample_points_by_time=points_by_time, full_grid_parameters={(129, 0)})
    pressure_jobs = [job for job in plan['jobs'] if job['dataset'] == 'reanalysis-era5-pressure-levels']
    levels = [int(level) for level in pressure_jobs[0]['request']['pressure_level']]
    if any([int(level) for level in job['request']['pressure_level']] != levels for job in pressure_jobs):
        raise ValueError('Requested pressure grids differ between months')
    args.output.mkdir(parents=True, exist_ok=True)
    results = []
    for case in calendar['cases']:
        points, times = case['points'], case['hours']
        ground, terrain_grid = archive.sample(129, terrain_time, 0, points)
        _, grid = archive.sample(248, times[0], levels[0], points)
        if grid != terrain_grid:
            raise ValueError('Terrain/pressure nearest grids differ')
        weather = [{**selected, 'elevation': float(ground[i] / STANDARD_GRAVITY), 'utc_offset_seconds': 0,
                    'hourly': {'time': times}, 'hourly_units': {'time': 'unixtime'}} for i, selected in enumerate(grid)]
        fields = [(248, level, f'cloud_cover_{level}hPa', 100, '%') for level in levels]
        fields += [(129, level, f'geopotential_height_{level}hPa', 1 / STANDARD_GRAVITY, 'm') for level in levels]
        fields += [(parameter, 0, 'cloud_cover_' + name, 100, '%')
                   for parameter, name in [(186, 'low'), (187, 'mid'), (188, 'high')]]
        for parameter, level, field, factor, units in fields:
            samples = []
            for when in times:
                values, selected = archive.sample(parameter, when, level, points)
                if selected != grid:
                    raise ValueError('ERA5 variables use distinct nearest grids')
                samples.append(values * factor)
            for i, row in enumerate(weather):
                row['hourly'][field] = [float(values[i]) for values in samples]
                row['hourly_units'][field] = units
        aerosol_values, aerosol_grid = [], None
        for when in case['aerosolHours']:
            values, selected = archive.sample(210207, when, 0, points)
            if aerosol_grid is not None and selected != aerosol_grid:
                raise ValueError('AOD nearest grid changed between times')
            aerosol_grid = selected
            aerosol_values.append(values)
        aerosol = [{**selected, 'utc_offset_seconds': 0,
                    'hourly': {'time': case['aerosolHours'],
                               'aerosol_optical_depth': [float(values[i]) for values in aerosol_values]},
                    'hourly_units': {'time': 'unixtime', 'aerosol_optical_depth': 'dimensionless'}}
                   for i, selected in enumerate(aerosol_grid)]
        record = {**case, 'weather': weather, 'aerosol': aerosol, 'pressureHpa': levels,
                  'fieldProvenance': {
                      'cloud_height_layers_terrain': 'ERA5 reanalysis pressure/single levels; static terrain from June-10 geopotential / standard gravity',
                      'aod': 'CAMS EAC4 reanalysis native total-column AOD550',
                      'sampling': 'Nearest native grid per requested fan location; linear interpolation in UTC time occurs in the model',
                      'precipitation_visibility': 'Absent from this weather-only directional-source bundle',
                      'model_run_lead': 'Reanalysis reconstruction; operational forecast issue time and lead have no value',
                      'observed_labels': 'Unretrieved during weather preparation'}}
        target = args.output / (case['id'] + '.json')
        target.write_text(json.dumps(record, separators=(',', ':'), ensure_ascii=False, allow_nan=False) + '\n')
        results.append({'id': case['id'], 'file': target.name, 'sha256': file_hash(target)})
    manifest = {'builtAt': datetime.now(timezone.utc).isoformat(), 'calendarSha256': file_hash(calendar_path),
                'requestPlanSha256': file_hash(plan_path), 'pressureHpa': levels, 'cases': results,
                'raw': receipts, 'normalizerSha256': file_hash(Path(__file__)),
                'decoderSha256': file_hash(ROOT / 'scripts/reanalysis_grib.py'), 'pointStreamRetention': True,
                'sourceLabelsRead': 0, 'scope': '122 calendar-selected weather bundles; future observed-label evaluation follows candidate/policy freeze'}
    (args.output / 'manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')
    print(json.dumps({'weatherCases': len(results), 'pressureLevels': len(levels), 'sourceLabelsRead': 0,
                      'output': str(args.output.relative_to(ROOT))}), flush=True)


if __name__ == '__main__':
    main()
