import { Icon } from "@iconify/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { type LotOut, useListLotsApiV1LotsGet } from "../../api/generated";

import "./main.css";

type KakaoLatLng = object;
type KakaoLatLngBounds = {
  extend: (latLng: KakaoLatLng) => void;
};
type KakaoControl = object;
type KakaoOverlay = {
  setMap: (map: KakaoMap | null) => void;
};

type KakaoMap = {
  addControl: (control: KakaoControl, position: number) => void;
  panTo: (latLng: KakaoLatLng) => void;
  relayout: () => void;
  setBounds: (bounds: KakaoLatLngBounds) => void;
  setCenter: (latLng: KakaoLatLng) => void;
  setLevel: (level: number) => void;
};

type KakaoMapsNamespace = {
  ControlPosition: {
    RIGHT: number;
    TOPRIGHT: number;
  };
  CustomOverlay: new (options: {
    clickable?: boolean;
    content: HTMLElement;
    position: KakaoLatLng;
    yAnchor?: number;
  }) => KakaoOverlay;
  LatLng: new (latitude: number, longitude: number) => KakaoLatLng;
  LatLngBounds: new () => KakaoLatLngBounds;
  Map: new (
    container: HTMLElement,
    options: { center: KakaoLatLng; level: number }
  ) => KakaoMap;
  MapTypeControl: new () => KakaoControl;
  ZoomControl: new () => KakaoControl;
  load: (callback: () => void) => void;
};

declare global {
  interface Window {
    kakao?: {
      maps: KakaoMapsNamespace;
    };
  }
}

const KAKAO_MAP_SDK_ID = "kakao-map-sdk";
const KNU_DAEGU_CAMPUS = {
  latitude: 35.8889,
  longitude: 128.6108,
};
const CAMPUS_MAP_LEVEL = 4;
const kakaoMapApiKey = import.meta.env.VITE_KAKAO_MAP_API_KEY;
const EMPTY_LOTS: LotOut[] = [];

let kakaoMapSdkPromise: Promise<Window["kakao"]> | null = null;

function loadKakaoMapSdk(appKey: string) {
  if (window.kakao?.maps) {
    return new Promise<Window["kakao"]>((resolve) => {
      window.kakao?.maps.load(() => resolve(window.kakao));
    });
  }

  if (!kakaoMapSdkPromise) {
    kakaoMapSdkPromise = new Promise((resolve, reject) => {
      const existingScript = document.getElementById(KAKAO_MAP_SDK_ID);

      const handleLoad = () => {
        if (!window.kakao?.maps) {
          reject(new Error("Kakao Map SDK를 사용할 수 없습니다."));
          return;
        }

        window.kakao.maps.load(() => resolve(window.kakao));
      };

      if (existingScript) {
        existingScript.addEventListener("load", handleLoad, { once: true });
        existingScript.addEventListener(
          "error",
          () => reject(new Error("Kakao Map SDK 로드에 실패했습니다.")),
          { once: true }
        );
        return;
      }

      const script = document.createElement("script");
      script.id = KAKAO_MAP_SDK_ID;
      script.async = true;
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(
        appKey
      )}&autoload=false`;
      script.addEventListener("load", handleLoad, { once: true });
      script.addEventListener(
        "error",
        () => reject(new Error("Kakao Map SDK 로드에 실패했습니다.")),
        { once: true }
      );
      document.head.appendChild(script);
    });
  }

  return kakaoMapSdkPromise;
}

function isValidCoordinate(lot: LotOut) {
  const isValidLatitude = lot.latitude >= -90 && lot.latitude <= 90;
  const isValidLongitude = lot.longitude >= -180 && lot.longitude <= 180;
  const isPlaceholderCoordinate = lot.latitude === 0 && lot.longitude === 0;

  return isValidLatitude && isValidLongitude && !isPlaceholderCoordinate;
}

function getCongestionLevel(lot: LotOut) {
  if (!lot.total_spaces) return "low";

  const occupiedRate =
    (lot.total_spaces - lot.available_spaces) / lot.total_spaces;

  if (occupiedRate >= 0.75) return "high";
  if (occupiedRate >= 0.5) return "mid";
  return "low";
}

function getCongestionLabel(level: ReturnType<typeof getCongestionLevel>) {
  if (level === "high") return "혼잡";
  if (level === "mid") return "보통";
  return "여유";
}

function formatNumber(value: number) {
  return value.toLocaleString("ko-KR");
}

function formatCurrency(value: number) {
  return `${formatNumber(value)}원`;
}

function formatCoordinate(value: number) {
  return value.toFixed(6);
}

function formatFee(lot: LotOut) {
  const hasBaseFee = lot.base_fee > 0 && lot.base_duration_minutes > 0;
  const hasExtraFee =
    lot.extra_fee_per_unit > 0 && lot.extra_fee_unit_minutes > 0;

  if (!hasBaseFee && !hasExtraFee) {
    return "무료";
  }

  const feeParts = [
    hasBaseFee
      ? `기본 ${formatCurrency(lot.base_fee)} / ${formatNumber(
          lot.base_duration_minutes
        )}분`
      : null,
    hasExtraFee
      ? `추가 ${formatCurrency(lot.extra_fee_per_unit)} / ${formatNumber(
          lot.extra_fee_unit_minutes
        )}분`
      : null,
    lot.daily_max_fee ? `일 최대 ${formatCurrency(lot.daily_max_fee)}` : null,
  ];

  return feeParts.filter(Boolean).join(" · ");
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "주차장 정보를 불러오지 못했습니다.";
}

function createParkingPin(
  lot: LotOut,
  isSelected: boolean,
  onSelect: (lotId: string) => void
) {
  const level = getCongestionLevel(lot);
  const pin = document.createElement("button");
  const count = document.createElement("span");
  const label = document.createElement("span");

  pin.type = "button";
  pin.className = `map-parking-pin map-parking-pin--${level}${
    isSelected ? " is-selected" : ""
  }`;
  pin.title = lot.name;
  count.className = "map-parking-pin__count";
  count.textContent = String(lot.available_spaces);
  label.className = "map-parking-pin__label";
  label.textContent = lot.name;
  pin.append(count, label);
  pin.addEventListener("click", () => onSelect(lot.id));

  return pin;
}

function CongestionBadge({ lot }: { lot: LotOut }) {
  const level = getCongestionLevel(lot);

  return (
    <span className={`congestion-badge congestion-badge--${level}`}>
      {getCongestionLabel(level)}
    </span>
  );
}

type ParkingLotListProps = {
  isLoading: boolean;
  lots: LotOut[];
  onSelectLot: (lotId: string) => void;
  selectedLotId?: string;
};

function ParkingLotList({
  isLoading,
  lots,
  onSelectLot,
  selectedLotId,
}: ParkingLotListProps) {
  return (
    <aside className="lot-panel">
      <div className="lot-panel__header">
        <div>
          <p className="op-card__title">전체 주차장 목록</p>
          <span>지도 위에 표시되는 주차장 정보</span>
        </div>
        <strong>{formatNumber(lots.length)}개</strong>
      </div>

      {isLoading ? (
        <div className="empty-state">주차장 정보를 불러오는 중입니다.</div>
      ) : lots.length === 0 ? (
        <div className="empty-state">등록된 주차장이 없습니다.</div>
      ) : (
        <div className="lot-list" role="list">
          {lots.map((lot) => (
            <button
              key={lot.id}
              type="button"
              className={`lot-card${
                lot.id === selectedLotId ? " is-selected" : ""
              }`}
              onClick={() => onSelectLot(lot.id)}
              role="listitem"
            >
              <div className="lot-card__top">
                <div className="lot-card__title-group">
                  <span className="lot-card__name">{lot.name}</span>
                  <span className="lot-card__address">{lot.address}</span>
                </div>
                <CongestionBadge lot={lot} />
              </div>

              <div className="lot-card__space">
                <span>남은 공간</span>
                <strong>
                  {formatNumber(lot.available_spaces)} /{" "}
                  {formatNumber(lot.total_spaces)}
                </strong>
              </div>

              <dl className="lot-card__meta">
                <div>
                  <dt>요금</dt>
                  <dd>{formatFee(lot)}</dd>
                </div>
                <div>
                  <dt>위도</dt>
                  <dd>{formatCoordinate(lot.latitude)}</dd>
                </div>
                <div>
                  <dt>경도</dt>
                  <dd>{formatCoordinate(lot.longitude)}</dd>
                </div>
              </dl>
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}

export function Main() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  const mapsRef = useRef<KakaoMapsNamespace | null>(null);
  const overlaysRef = useRef<KakaoOverlay[]>([]);
  const [selectedLotId, setSelectedLotId] = useState<string | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const [mapErrorMessage, setMapErrorMessage] = useState(() =>
    kakaoMapApiKey ? "" : "VITE_KAKAO_MAP_API_KEY가 설정되지 않았습니다."
  );

  const lotsQuery = useListLotsApiV1LotsGet({
    query: {
      staleTime: 30_000,
    },
  });

  const lots = lotsQuery.data ?? EMPTY_LOTS;
  const selectedLot = useMemo(
    () => lots.find((lot) => lot.id === selectedLotId) ?? lots[0] ?? null,
    [lots, selectedLotId]
  );
  const coordinateLots = useMemo(
    () => lots.filter((lot) => isValidCoordinate(lot)),
    [lots]
  );

  useEffect(() => {
    if (!kakaoMapApiKey) {
      return;
    }

    let cleanupResizeListener: (() => void) | undefined;
    let isMounted = true;

    loadKakaoMapSdk(kakaoMapApiKey)
      .then((kakao) => {
        const container = mapContainerRef.current;

        if (!isMounted || !kakao?.maps || !container) {
          return;
        }

        const { maps } = kakao;
        const campusCenter = new maps.LatLng(
          KNU_DAEGU_CAMPUS.latitude,
          KNU_DAEGU_CAMPUS.longitude
        );
        const map = new maps.Map(container, {
          center: campusCenter,
          level: CAMPUS_MAP_LEVEL,
        });

        map.addControl(
          new maps.MapTypeControl(),
          maps.ControlPosition.TOPRIGHT
        );
        map.addControl(new maps.ZoomControl(), maps.ControlPosition.RIGHT);

        mapRef.current = map;
        mapsRef.current = maps;
        setIsMapReady(true);

        const handleResize = () => {
          map.relayout();
          map.setCenter(campusCenter);
        };

        window.addEventListener("resize", handleResize);
        cleanupResizeListener = () => {
          window.removeEventListener("resize", handleResize);
        };
      })
      .catch((error: unknown) => {
        if (!isMounted) {
          return;
        }

        setMapErrorMessage(
          error instanceof Error
            ? error.message
            : "Kakao Map SDK 로드 중 오류가 발생했습니다."
        );
      });

    return () => {
      isMounted = false;
      cleanupResizeListener?.();
      overlaysRef.current.forEach((overlay) => overlay.setMap(null));
      overlaysRef.current = [];
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const maps = mapsRef.current;

    if (!isMapReady || !map || !maps) {
      return;
    }

    overlaysRef.current.forEach((overlay) => overlay.setMap(null));
    overlaysRef.current = coordinateLots.map((lot) => {
      const position = new maps.LatLng(lot.latitude, lot.longitude);
      const content = createParkingPin(
        lot,
        lot.id === selectedLot?.id,
        setSelectedLotId
      );
      const overlay = new maps.CustomOverlay({
        clickable: true,
        content,
        position,
        yAnchor: 1,
      });

      overlay.setMap(map);
      return overlay;
    });

    return () => {
      overlaysRef.current.forEach((overlay) => overlay.setMap(null));
      overlaysRef.current = [];
    };
  }, [coordinateLots, isMapReady, selectedLot?.id]);

  useEffect(() => {
    const map = mapRef.current;
    const maps = mapsRef.current;

    if (!isMapReady || !map || !maps || coordinateLots.length === 0) {
      return;
    }

    if (coordinateLots.length === 1) {
      const [lot] = coordinateLots;
      map.setCenter(new maps.LatLng(lot.latitude, lot.longitude));
      map.setLevel(CAMPUS_MAP_LEVEL);
      return;
    }

    const bounds = new maps.LatLngBounds();
    coordinateLots.forEach((lot) => {
      bounds.extend(new maps.LatLng(lot.latitude, lot.longitude));
    });
    map.setBounds(bounds);
  }, [coordinateLots, isMapReady]);

  useEffect(() => {
    const map = mapRef.current;
    const maps = mapsRef.current;

    if (!isMapReady || !map || !maps || !selectedLot) {
      return;
    }

    if (!isValidCoordinate(selectedLot)) {
      return;
    }

    map.panTo(new maps.LatLng(selectedLot.latitude, selectedLot.longitude));
  }, [isMapReady, selectedLot]);

  const hasNoVisiblePins = lots.length > 0 && coordinateLots.length === 0;

  return (
    <main className="parking-map-page">
      <div className="map-background">
        <div
          ref={mapContainerRef}
          className="kakao-map"
          aria-label="주차장 위치 지도"
        />
        {mapErrorMessage && (
          <div className="map-message" role="alert">
            {mapErrorMessage}
          </div>
        )}
        {hasNoVisiblePins && !mapErrorMessage && (
          <div className="map-message">표시 가능한 좌표가 없습니다.</div>
        )}
      </div>

      <header className="map-topbar">
        <div className="brand">
          <span className="brand__icon" aria-hidden="true">
            <Icon icon="material-symbols:parking-sign" />
          </span>
          <span className="brand__name">OpenPark</span>
          <span className="brand__context">주차장 현황</span>
        </div>
      </header>

      {lotsQuery.isError && (
        <div className="api-error" role="alert">
          {getErrorMessage(lotsQuery.error)}
        </div>
      )}

      <ParkingLotList
        isLoading={lotsQuery.isLoading}
        lots={lots}
        onSelectLot={setSelectedLotId}
        selectedLotId={selectedLot?.id}
      />
    </main>
  );
}
