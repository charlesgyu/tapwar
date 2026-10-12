import Foundation
import Capacitor
import StoreKit

/// 인앱 구매 (StoreKit 2, 비소모성 상품)
/// JS: Capacitor.registerPlugin('Store') → getProducts / purchase / restore / entitlements
/// 상품 ID 는 App Store Connect 에 등록한 것과 같아야 함 (game.js 의 PRODUCTS 참고)
@objc(StorePlugin)
public class StorePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "StorePlugin"
    public let jsName = "Store"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "entitlements", returnType: CAPPluginReturnPromise)
    ]

    private var products: [String: Product] = [:]
    private var updatesTask: Task<Void, Never>?

    override public func load() {
        // 앱 밖에서 끝난 결제(승인 대기, 다른 기기 구매, 환불 등)를 받아서 JS 에 알림
        updatesTask = Task.detached { [weak self] in
            for await result in Transaction.updates {
                if case .verified(let t) = result {
                    await t.finish()
                    let ids = await StorePlugin.ownedIds()
                    self?.notifyListeners("ownedChanged", data: ["owned": ids])
                }
            }
        }
    }

    deinit { updatesTask?.cancel() }

    /// 지금 이 Apple ID 가 가진 상품 ID 목록 (환불된 것은 빠짐)
    static func ownedIds() async -> [String] {
        var ids: [String] = []
        for await result in Transaction.currentEntitlements {
            if case .verified(let t) = result, t.revocationDate == nil { ids.append(t.productID) }
        }
        return ids
    }

    /// 상품 정보 (현지 가격 문자열 포함)
    @objc func getProducts(_ call: CAPPluginCall) {
        let ids = call.getArray("ids", String.self) ?? []
        Task {
            do {
                let list = try await Product.products(for: ids)
                var out: [[String: Any]] = []
                for p in list {
                    self.products[p.id] = p
                    out.append(["id": p.id, "price": p.displayPrice, "title": p.displayName])
                }
                call.resolve(["products": out])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    /// 구매: 결과 status = purchased / cancelled / pending
    @objc func purchase(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else { call.reject("id 필요"); return }
        Task {
            do {
                var product = self.products[id]
                if product == nil { product = try await Product.products(for: [id]).first }
                guard let p = product else { call.reject("상품을 찾을 수 없어요"); return }
                let result = try await p.purchase()
                switch result {
                case .success(let verification):
                    guard case .verified(let t) = verification else { call.reject("결제 확인 실패"); return }
                    await t.finish()
                    call.resolve(["status": "purchased", "owned": await StorePlugin.ownedIds()])
                case .userCancelled:
                    call.resolve(["status": "cancelled"])
                case .pending:
                    call.resolve(["status": "pending"])
                @unknown default:
                    call.resolve(["status": "cancelled"])
                }
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    /// 구매 복원: App Store 와 동기화 후 가진 상품 목록
    @objc func restore(_ call: CAPPluginCall) {
        Task {
            do { try await AppStore.sync() } catch { /* 취소해도 현재 목록은 돌려줌 */ }
            call.resolve(["owned": await StorePlugin.ownedIds()])
        }
    }

    /// 앱 시작 시: 로그인 창 없이 가진 상품 목록만
    @objc func entitlements(_ call: CAPPluginCall) {
        Task { call.resolve(["owned": await StorePlugin.ownedIds()]) }
    }
}
