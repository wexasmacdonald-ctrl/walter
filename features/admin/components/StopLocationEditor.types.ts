export type StopLocationCoordinate = {
  latitude: number;
  longitude: number;
};

export type StopLocationEditorProps = {
  coordinate: StopLocationCoordinate;
  onChange: (coordinate: StopLocationCoordinate) => void;
  mapType?: 'standard' | 'satellite';
};
