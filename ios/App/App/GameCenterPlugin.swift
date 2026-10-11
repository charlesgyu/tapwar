import Foundation
import Capacitor
import GameKit

/// 게임 센터 순위표 연결 (나라별 총 시간 순위)
/// JS: Capacitor.registerPlugin('GameCenter') → authenticate / submitScore / showLeaderboard
@objc(GameCenterPlugin)
public class GameCenterPlugin: CAPPlugin, CAPBridgedPlugin, GKGameCenterControllerDelegate {
    public let identifier = "GameCenterPlugin"
    public let jsName = "GameCenter"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "submitScore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showLeaderboard", returnType: CAPPluginReturnPromise)
    ]

    /// 앱 시작 시 한 번: 아이폰에 로그인된 Apple 계정으로 게임 센터 자동 로그인 (필요할 때만 로그인 화면)
    @objc func authenticate(_ call: CAPPluginCall) {
        let player = GKLocalPlayer.local
        player.authenticateHandler = { [weak self] viewController, error in
            if let vc = viewController {
                DispatchQueue.main.async { self?.bridge?.viewController?.present(vc, animated: true) }
                return
            }
            call.resolve(["authenticated": player.isAuthenticated, "error": error?.localizedDescription ?? ""])
        }
    }

    /// 점수 제출: score 는 초 단위 정수 (순위표 형식: 경과 시간, 낮을수록 좋음)
    @objc func submitScore(_ call: CAPPluginCall) {
        guard let leaderboardId = call.getString("leaderboardId"), let score = call.getInt("score") else {
            call.reject("leaderboardId, score 필요"); return
        }
        guard GKLocalPlayer.local.isAuthenticated else { call.reject("게임 센터 로그인 안 됨"); return }
        GKLeaderboard.submitScore(score, context: 0, player: GKLocalPlayer.local, leaderboardIDs: [leaderboardId]) { error in
            if let error = error { call.reject(error.localizedDescription) } else { call.resolve() }
        }
    }

    /// 순위표 화면 열기
    @objc func showLeaderboard(_ call: CAPPluginCall) {
        let leaderboardId = call.getString("leaderboardId") ?? ""
        DispatchQueue.main.async {
            let vc: GKGameCenterViewController
            if leaderboardId.isEmpty {
                vc = GKGameCenterViewController(state: .leaderboards)
            } else {
                vc = GKGameCenterViewController(leaderboardID: leaderboardId, playerScope: .global, timeScope: .allTime)
            }
            vc.gameCenterDelegate = self
            self.bridge?.viewController?.present(vc, animated: true)
            call.resolve()
        }
    }

    public func gameCenterViewControllerDidFinish(_ gameCenterViewController: GKGameCenterViewController) {
        gameCenterViewController.dismiss(animated: true)
    }
}
