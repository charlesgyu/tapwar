import UIKit
import Capacitor

/// 앱 안에 직접 넣은 플러그인(게임 센터)을 등록하는 메인 화면
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(GameCenterPlugin())
    }
}
