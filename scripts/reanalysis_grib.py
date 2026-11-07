"""Strict offline decoding and nearest-cell sampling of the selected GRIB data."""
from datetime import datetime, timezone
import hashlib
from pathlib import Path

import eccodes as ec
import numpy as np

PARAMETERS = {
    248: ("cc", "(0 - 1)", "isobaricInhPa"),
    246: ("clwc", "kg kg**-1", "isobaricInhPa"),
    247: ("ciwc", "kg kg**-1", "isobaricInhPa"),
    130: ("t", "K", "isobaricInhPa"),
    129: ("z", "m**2 s**-2", "isobaricInhPa"),
    186: ("lcc", "(0 - 1)", "surface"),
    187: ("mcc", "(0 - 1)", "surface"),
    188: ("hcc", "(0 - 1)", "surface"),
    210207: ("aod550", "~", "surface"),
}
STANDARD_GRAVITY = 9.80665


def file_hash(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


class Grid:
    def __init__(self, latitudes, longitudes):
        self.raw_lat = np.asarray(latitudes)
        self.raw_lon = np.asarray(longitudes) % 360
        self.latitude = np.unique(self.raw_lat)
        self.longitude = np.unique(self.raw_lon)
        self.lat_i = np.searchsorted(self.latitude, self.raw_lat)
        self.lon_i = np.searchsorted(self.longitude, self.raw_lon)
        addresses = self.lat_i * len(self.longitude) + self.lon_i
        if len(addresses) != len(self.latitude) * len(self.longitude) or len(np.unique(addresses)) != len(addresses):
            raise ValueError("GRIB grid must contain each cell of a complete regular latitude/longitude grid once")

    def canonical(self, values):
        result = np.empty((len(self.latitude), len(self.longitude)))
        result[self.lat_i, self.lon_i] = values
        return result

    def select(self, points):
        lat = np.array([p["lat"] for p in points])
        lon = np.array([p["lon"] % 360 for p in points])
        if (lat.min() < self.latitude[0] or lat.max() > self.latitude[-1]
                or lon.min() < self.longitude[0] or lon.max() > self.longitude[-1]):
            raise ValueError("requested section extends beyond the actual downloaded GRIB grid")
        lat_i = abs(self.latitude[:, None] - lat).argmin(axis=0)
        lon_i = abs(self.longitude[:, None] - lon).argmin(axis=0)
        selected = [{"latitude": float(self.latitude[i]), "longitude": float(self.longitude[j])}
                    for i, j in zip(lat_i, lon_i)]
        return lat_i, lon_i, selected


class GribArchive:
    def __init__(self, paths, wanted_times):
        self.fields, self.grids, self.receipts = {}, {}, []
        for path in sorted(map(Path, paths)):
            count = retained = duplicates = 0
            with path.open("rb") as stream:
                while (handle := ec.codes_grib_new_from_file(stream)) is not None:
                    try:
                        count += 1
                        param = ec.codes_get(handle, "paramId")
                        if param not in PARAMETERS:
                            raise ValueError(f"unexpected parameter {param} in {path.name}")
                        short, units, level_type = PARAMETERS[param]
                        if (ec.codes_get(handle, "shortName"), ec.codes_get(handle, "units"),
                                ec.codes_get(handle, "typeOfLevel")) != (short, units, level_type):
                            raise ValueError(f"parameter identity or units changed: {path.name} / {param}")
                        day = str(ec.codes_get(handle, "validityDate"))
                        hour = f"{ec.codes_get(handle, 'validityTime'):04d}"
                        when = int(datetime.strptime(day + hour, "%Y%m%d%H%M").replace(tzinfo=timezone.utc).timestamp())
                        if when not in wanted_times[param]:
                            continue
                        if ec.codes_get(handle, "gridType") != "regular_ll" or ec.codes_get(handle, "numberOfMissing"):
                            raise ValueError(f"unsupported grid or missing regional values: {path.name}")
                        grid_key = ec.codes_get(handle, "md5GridSection")
                        if grid_key not in self.grids:
                            self.grids[grid_key] = Grid(ec.codes_get_array(handle, "latitudes"),
                                                       ec.codes_get_array(handle, "longitudes"))
                        values = self.grids[grid_key].canonical(ec.codes_get_values(handle))
                        if not np.isfinite(values).all():
                            raise ValueError(f"nonfinite values: {path.name} / {param}")
                        if param in (248, 186, 187, 188) and (values.min() < 0 or values.max() > 1):
                            raise ValueError("cloud fraction outside [0,1]")
                        if param in (246, 247, 210207) and values.min() < 0:
                            raise ValueError(f"negative water/ice/AOD: {path.name} / {param}")
                        key = (param, when, int(ec.codes_get(handle, "level")))
                        if key in self.fields:
                            old_grid, old_values = self.fields[key]
                            if grid_key != old_grid or not np.array_equal(values, old_values):
                                raise ValueError(f"conflicting overlapping GRIB fields: {key}")
                            duplicates += 1
                        else:
                            self.fields[key] = (grid_key, values)
                            retained += 1
                    finally:
                        ec.codes_release(handle)
            self.receipts.append({"file": str(path), "bytes": path.stat().st_size, "sha256": file_hash(path),
                                  "messages": count, "retained_fields": retained, "identical_overlaps": duplicates})
            print(f"Decoded {path.name}: {count} messages, {retained} retained, {duplicates} identical overlaps", flush=True)

    def sample(self, param, when, pressure, points):
        try:
            grid_key, values = self.fields[(param, when, pressure)]
        except KeyError as error:
            raise ValueError(f"required GRIB field missing: parameter={param}, UTC={datetime.fromtimestamp(when, timezone.utc).isoformat()}, pressure={pressure}") from error
        lat_i, lon_i, selected = self.grids[grid_key].select(points)
        return values[lat_i, lon_i], selected
