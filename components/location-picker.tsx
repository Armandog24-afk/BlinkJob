"use client";

import { useState } from "react";
import { ITALIAN_CITIES } from "@/lib/data/cities";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MapPin, LocateFixed } from "lucide-react";

/** Reusable lat/lng picker (browser geolocation + curated city fallback) — no external maps provider. */
export function LocationPicker({ latName = "lat", lngName = "lng" }: { latName?: string; lngName?: string }) {
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [locationLabel, setLocationLabel] = useState("");
  const [geoError, setGeoError] = useState("");

  function useCurrentLocation() {
    setGeoError("");
    if (!navigator.geolocation) {
      setGeoError("Il browser non supporta la geolocalizzazione.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
        setLocationLabel("Posizione attuale rilevata");
      },
      () => setGeoError("Non è stato possibile rilevare la posizione. Scegli una città.")
    );
  }

  function selectCity(cityLabel: string | null) {
    const city = ITALIAN_CITIES.find((c) => c.label === cityLabel);
    if (!city) return;
    setLat(city.lat);
    setLng(city.lng);
    setLocationLabel(city.label);
  }

  return (
    <div className="space-y-2">
      <input type="hidden" name={latName} value={lat ?? ""} />
      <input type="hidden" name={lngName} value={lng ?? ""} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" onClick={useCurrentLocation}>
          <LocateFixed className="mr-1.5 size-4" />
          Usa la mia posizione
        </Button>
        <span className="text-sm text-muted-foreground">oppure</span>
        <Select onValueChange={selectCity}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Scegli una città" />
          </SelectTrigger>
          <SelectContent>
            {ITALIAN_CITIES.map((c) => (
              <SelectItem key={c.label} value={c.label}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {locationLabel && (
        <p className="flex items-center gap-1.5 text-sm text-primary">
          <MapPin className="size-4" /> {locationLabel}
        </p>
      )}
      {geoError && <p className="text-sm text-destructive">{geoError}</p>}
    </div>
  );
}
