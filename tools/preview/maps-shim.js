// Sustituto de react-native-maps SOLO para la vista previa en navegador.
const React = require('react');
const { View } = require('react-native');
const Svg = require('react-native-svg');

const MapView = React.forwardRef(function MapView({ style, children, onMapReady }, ref) {
  React.useImperativeHandle(ref, () => ({ animateCamera() {}, animateToRegion() {}, setCamera() {} }));
  React.useEffect(() => {
    onMapReady && onMapReady();
  }, []);
  const S = Svg.default;
  return React.createElement(
    View,
    { style: [{ backgroundColor: '#0d1117', overflow: 'hidden' }, style] },
    React.createElement(
      S,
      { width: '100%', height: '100%', viewBox: '0 0 400 200', preserveAspectRatio: 'xMidYMid slice' },
      React.createElement(Svg.Path, { d: 'M -20 60 L 420 20 M -20 140 L 420 90 M -20 210 L 420 170 M 60 -10 L 120 220 M 200 -10 L 230 220 M 320 -10 L 300 220 M -10 100 L 200 -20 M 240 220 L 420 60', stroke: '#1f2733', strokeWidth: 5, fill: 'none' }),
      React.createElement(Svg.Path, { d: 'M -20 30 L 420 0 M -20 180 L 420 130 M 140 -10 L 170 220 M 270 -10 L 262 220', stroke: '#171d26', strokeWidth: 2.5, fill: 'none' })
    ),
    children
  );
});
const Null = () => null;
module.exports = { __esModule: true, default: MapView, MapView, Marker: Null, Polyline: Null, Circle: Null, PROVIDER_GOOGLE: 'google' };
