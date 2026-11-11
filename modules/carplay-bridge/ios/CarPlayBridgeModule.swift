import CarPlay
import CoreLocation
import ExpoModulesCore

// MARK: - Módulo que ve JavaScript

/// Puente entre la app (JS) y la pantalla de CarPlay.
/// - `setState`: la app manda límite, unidades, estado del viaje y potencia.
/// - `onCarPlayAction`: los botones de CarPlay piden iniciar, pausar o terminar.
/// - `onCarPlayConnection`: avisa cuando el iPhone se conecta o desconecta del carro.
public final class CarPlayBridgeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CarPlayBridge")

    Events("onCarPlayAction", "onCarPlayConnection")

    OnCreate {
      CarPlayHub.shared.module = self
      // Referencia explícita a la escena: así el enlazador nunca la descarta,
      // aunque solo se cree por nombre desde el Info.plist.
      _ = CarSceneDelegate.self
    }

    OnDestroy {
      if CarPlayHub.shared.module === self {
        CarPlayHub.shared.module = nil
      }
    }

    Function("setState") { (state: [String: Any]) in
      CarPlayHub.shared.updateApp(from: state)
    }

    Function("isConnected") { () -> Bool in
      return CarPlayHub.shared.isConnected
    }
  }
}

// MARK: - Estado compartido (seguro entre hilos)

final class CarPlayHub: @unchecked Sendable {
  static let shared = CarPlayHub()

  struct AppSnapshot {
    var limitKmh: Double?
    var unitMph = false
    var tripStatus = "idle"
    var distanceM = 0.0
    var durationMs = 0.0
    var maxKmh = 0.0
    var powerCv: Double?
    var factoryPowerCv: Double?
    var receivedAt: Date?
  }

  struct FixSnapshot {
    var speedKmh = 0.0
    var altitudeM: Double?
    var courseDeg: Double?
    var accuracyM: Double?
    var at: Date?
    var sessionMaxKmh = 0.0
  }

  private let lock = NSLock()
  private weak var _module: CarPlayBridgeModule?
  private var _connected = false
  private var _app = AppSnapshot()
  private var _fix = FixSnapshot()

  private let defaults = UserDefaults.standard
  private let limitKey = "carplay.limitKmh"
  private let mphKey = "carplay.unitMph"

  private init() {
    // Último límite y unidad conocidos: CarPlay puede abrirse con la app del
    // iPhone cerrada, y aun así debe saber a cuánto avisar.
    let saved = defaults.double(forKey: limitKey)
    _app.limitKmh = saved > 0 ? saved : nil
    _app.unitMph = defaults.bool(forKey: mphKey)
  }

  private func locked<T>(_ body: () -> T) -> T {
    lock.lock()
    defer { lock.unlock() }
    return body()
  }

  var module: CarPlayBridgeModule? {
    get { locked { _module } }
    set { locked { _module = newValue } }
  }

  var isConnected: Bool { locked { _connected } }
  var app: AppSnapshot { locked { _app } }
  var fix: FixSnapshot { locked { _fix } }

  func updateApp(from state: [String: Any]) {
    func num(_ key: String) -> Double? {
      if let n = state[key] as? NSNumber { return n.doubleValue }
      return state[key] as? Double
    }
    var next = AppSnapshot()
    next.limitKmh = num("limitKmh")
    next.unitMph = (state["unitMph"] as? Bool) ?? false
    next.tripStatus = (state["tripStatus"] as? String) ?? "idle"
    next.distanceM = num("distanceM") ?? 0
    next.durationMs = num("durationMs") ?? 0
    next.maxKmh = num("maxKmh") ?? 0
    next.powerCv = num("powerCv")
    next.factoryPowerCv = num("factoryPowerCv")
    next.receivedAt = Date()
    locked { _app = next }
    defaults.set(next.limitKmh ?? 0, forKey: limitKey)
    defaults.set(next.unitMph, forKey: mphKey)
  }

  func updateFix(speedMs: Double, altitudeM: Double?, courseDeg: Double?, accuracyM: Double) {
    locked {
      // Velocidad negativa = el GPS no la sabe. Por debajo de 2 km/h es ruido.
      var kmh = speedMs >= 0 ? speedMs * 3.6 : 0
      if kmh < 2 { kmh = 0 }
      _fix.speedKmh = kmh
      _fix.altitudeM = altitudeM
      _fix.courseDeg = courseDeg
      _fix.accuracyM = accuracyM
      _fix.at = Date()
      if accuracyM < 30 { _fix.sessionMaxKmh = max(_fix.sessionMaxKmh, kmh) }
    }
  }

  func setConnected(_ connected: Bool) {
    locked {
      _connected = connected
      if !connected { _fix = FixSnapshot() }
    }
    module?.sendEvent("onCarPlayConnection", ["connected": connected])
  }

  func sendAction(_ action: String) {
    module?.sendEvent("onCarPlayAction", ["action": action])
  }
}

// MARK: - Escena de CarPlay

/// Pantalla en el carro (categoría "tareas de conducción" de Apple). CarPlay solo
/// permite plantillas del sistema, así que es una ficha de información con los
/// datos grandes y botones para el viaje. Lee el GPS por su cuenta: muestra la
/// velocidad aunque la app del iPhone no esté abierta.
@objc(CarSceneDelegate)
public final class CarSceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate, CLLocationManagerDelegate {
  private var interfaceController: CPInterfaceController?
  private var template: CPInformationTemplate?
  private var locationManager: CLLocationManager?
  private var refreshTask: Task<Void, Never>?
  private var shownActionsKey = ""

  public func templateApplicationScene(
    _ templateApplicationScene: CPTemplateApplicationScene,
    didConnect interfaceController: CPInterfaceController
  ) {
    self.interfaceController = interfaceController

    let t = CPInformationTemplate(
      title: "Polo Track",
      layout: .twoColumn,
      items: buildItems(),
      actions: buildActions()
    )
    template = t
    interfaceController.setRootTemplate(t, animated: false, completion: nil)

    let manager = CLLocationManager()
    manager.delegate = self
    manager.desiredAccuracy = kCLLocationAccuracyBestForNavigation
    manager.activityType = .automotiveNavigation
    manager.startUpdatingLocation()
    locationManager = manager

    CarPlayHub.shared.setConnected(true)

    refreshTask = Task { @MainActor [weak self] in
      while !Task.isCancelled {
        self?.refresh()
        try? await Task.sleep(nanoseconds: 1_000_000_000)
      }
    }
  }

  public func templateApplicationScene(
    _ templateApplicationScene: CPTemplateApplicationScene,
    didDisconnectInterfaceController interfaceController: CPInterfaceController
  ) {
    refreshTask?.cancel()
    refreshTask = nil
    locationManager?.stopUpdatingLocation()
    locationManager = nil
    template = nil
    self.interfaceController = nil
    CarPlayHub.shared.setConnected(false)
  }

  // MARK: GPS

  nonisolated public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    guard let loc = locations.last, loc.horizontalAccuracy >= 0 else { return }
    CarPlayHub.shared.updateFix(
      speedMs: loc.speed,
      altitudeM: loc.verticalAccuracy >= 0 ? loc.altitude : nil,
      courseDeg: loc.course >= 0 ? loc.course : nil,
      accuracyM: loc.horizontalAccuracy
    )
  }

  // MARK: Contenido

  private func refresh() {
    guard let template else { return }
    template.items = buildItems()
    let key = actionsKey()
    if key != shownActionsKey {
      template.actions = buildActions()
    }
  }

  private func appIsAlive(_ app: CarPlayHub.AppSnapshot) -> Bool {
    guard let at = app.receivedAt else { return false }
    return Date().timeIntervalSince(at) < 5
  }

  private func actionsKey() -> String {
    let app = CarPlayHub.shared.app
    return appIsAlive(app) ? app.tripStatus : "sin-app"
  }

  private func speedText(_ kmh: Double, mph: Bool) -> String {
    mph ? "\(Int((kmh * 0.621371).rounded())) mph" : "\(Int(kmh.rounded())) km/h"
  }

  private func buildItems() -> [CPInformationItem] {
    let app = CarPlayHub.shared.app
    let fix = CarPlayHub.shared.fix
    let alive = appIsAlive(app)
    let mph = app.unitMph
    let fresh = fix.at.map { Date().timeIntervalSince($0) < 4 } ?? false

    var items: [CPInformationItem] = []
    items.append(CPInformationItem(title: "Velocidad", detail: fresh ? speedText(fix.speedKmh, mph: mph) : "buscando GPS…"))

    if let limit = app.limitKmh {
      let over = fresh && fix.speedKmh > limit
      items.append(CPInformationItem(
        title: over ? "⚠︎ Sobre el límite" : "Límite",
        detail: over ? "\(speedText(limit, mph: mph)) · baja \(Int((fix.speedKmh - limit).rounded()))" : speedText(limit, mph: mph)
      ))
    }

    let maxKmh = max(app.maxKmh, fix.sessionMaxKmh)
    items.append(CPInformationItem(title: "Máxima", detail: speedText(maxKmh, mph: mph)))

    if alive && app.tripStatus != "idle" {
      let km = app.distanceM / 1000
      let distance = mph ? String(format: "%.1f mi", km * 0.621371) : String(format: "%.1f km", km)
      items.append(CPInformationItem(title: app.tripStatus == "paused" ? "Viaje (en pausa)" : "Viaje", detail: distance))
      let mins = Int(app.durationMs / 60_000)
      items.append(CPInformationItem(title: "Tiempo", detail: mins >= 60 ? "\(mins / 60) h \(mins % 60) min" : "\(mins) min"))
    }

    if let alt = fix.altitudeM {
      items.append(CPInformationItem(title: "Altitud", detail: "\(Int(alt.rounded())) m"))
    }
    if let course = fix.courseDeg, fix.speedKmh >= 6 {
      items.append(CPInformationItem(title: "Rumbo", detail: "\(Int(course.rounded()))° \(cardinal(course))"))
    }
    if alive, let power = app.powerCv, let factory = app.factoryPowerCv {
      items.append(CPInformationItem(title: "Potencia aquí", detail: "\(Int(power.rounded())) de \(Int(factory.rounded())) CV"))
    }
    if !alive {
      items.append(CPInformationItem(title: "Viaje", detail: "abre Velocidad en el iPhone para grabarlo"))
    }
    return items
  }

  private func buildActions() -> [CPTextButton] {
    let app = CarPlayHub.shared.app
    shownActionsKey = actionsKey()
    guard appIsAlive(app) else { return [] }

    switch app.tripStatus {
    case "recording":
      return [
        CPTextButton(title: "Pausar", textStyle: .normal) { _ in CarPlayHub.shared.sendAction("pause") },
        CPTextButton(title: "Terminar viaje", textStyle: .cancel) { _ in CarPlayHub.shared.sendAction("stop") },
      ]
    case "paused":
      return [
        CPTextButton(title: "Seguir", textStyle: .confirm) { _ in CarPlayHub.shared.sendAction("resume") },
        CPTextButton(title: "Terminar viaje", textStyle: .cancel) { _ in CarPlayHub.shared.sendAction("stop") },
      ]
    default:
      return [
        CPTextButton(title: "Iniciar viaje", textStyle: .confirm) { _ in CarPlayHub.shared.sendAction("start") },
      ]
    }
  }

  private func cardinal(_ deg: Double) -> String {
    let names = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"]
    let i = Int(((deg.truncatingRemainder(dividingBy: 360) + 360).truncatingRemainder(dividingBy: 360) / 45).rounded()) % 8
    return names[i]
  }
}
