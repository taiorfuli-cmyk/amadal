import React from 'react';
import {
  Truck,
  ShieldCheck,
  RefreshCw,
  Phone,
  Mail,
  MapPin,
  Instagram,
  Facebook
} from 'lucide-react';
import { AmadalLogo } from './AmadalLogo';
import { useStore } from '../context/StoreContext';

interface FooterProps {
  onNavigate: (view: string, params?: any) => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  const { settings, categories } = useStore();
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-neutral-950 text-neutral-300 border-t border-neutral-800">
      {/* Trust & Value Highlights */}
      <div className="border-b border-neutral-850 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="flex items-center gap-4 p-4 rounded-xl bg-neutral-900/50 border border-neutral-800">
              <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center shrink-0 text-white">
                <Truck className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-white text-sm">توصيل لجميع الـ 69 ولاية</h4>
                <p className="text-xs text-neutral-400 mt-1">توصيل سريع لباب منزلك أو أقرب مكتب استلام</p>
              </div>
            </div>

            <div className="flex items-center gap-4 p-4 rounded-xl bg-neutral-900/50 border border-neutral-800">
              <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center shrink-0 text-white">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-white text-sm">الدفع عند الاستلام 100%</h4>
                <p className="text-xs text-neutral-400 mt-1">عاين طردك وتأكد من جودته ثم ادفع بكل أمان</p>
              </div>
            </div>

            <div className="flex items-center gap-4 p-4 rounded-xl bg-neutral-900/50 border border-neutral-800">
              <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center shrink-0 text-white">
                <RefreshCw className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-white text-sm">استبدال سهل وسريع</h4>
                <p className="text-xs text-neutral-400 mt-1">المقاس غير مناسب؟ نستبدله لك بكل سلاسة</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Footer Links */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
          {/* Brand Info */}
          <div className="md:col-span-1 space-y-4">
            <AmadalLogo variant="light" size="md" customLogoUrl={settings.logoUrl} />
            <p className="text-xs leading-relaxed text-neutral-400">
              {settings.storeDescription ||
                'AMADAL هي علامة أزياء شبابية جزائرية عصرية معنية بتقديم ملابس ستريتوير ومينيمال فاخرة بخامات متينة وقصات حصرية.'}
            </p>

            {/* Social Links */}
            <div className="flex items-center gap-3 pt-2">
              {settings.instagram && (
                <a
                  href={settings.instagram}
                  target="_blank"
                  rel="noreferrer"
                  className="w-9 h-9 rounded-full bg-neutral-850 hover:bg-white hover:text-black flex items-center justify-center transition-all text-neutral-300"
                  aria-label="Instagram"
                >
                  <Instagram className="w-4 h-4" />
                </a>
              )}
              {settings.facebook && (
                <a
                  href={settings.facebook}
                  target="_blank"
                  rel="noreferrer"
                  className="w-9 h-9 rounded-full bg-neutral-850 hover:bg-white hover:text-black flex items-center justify-center transition-all text-neutral-300"
                  aria-label="Facebook"
                >
                  <Facebook className="w-4 h-4" />
                </a>
              )}
              {settings.tiktok && (
                <a
                  href={settings.tiktok}
                  target="_blank"
                  rel="noreferrer"
                  className="w-9 h-9 rounded-full bg-neutral-850 hover:bg-white hover:text-black flex items-center justify-center transition-all text-neutral-300 font-bold text-xs"
                  aria-label="TikTok"
                >
                  TK
                </a>
              )}
            </div>
          </div>

          {/* Quick Categories */}
          <div>
            <h4 className="text-sm font-bold text-white uppercase tracking-wider mb-4">التصنيفات</h4>
            <ul className="space-y-2.5 text-xs text-neutral-400">
              {categories.slice(0, 5).map((cat) => (
                <li key={cat.id}>
                  <button
                    onClick={() => {
                      onNavigate('shop', { category: cat.slug });
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="hover:text-white transition-colors"
                  >
                    {cat.name}
                  </button>
                </li>
              ))}
              <li>
                <button
                  onClick={() => {
                    onNavigate('shop');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="hover:text-white transition-colors font-medium text-neutral-300"
                >
                  تصفح كل التشكيلة ←
                </button>
              </li>
            </ul>
          </div>

          {/* Customer Care & Policies */}
          <div>
            <h4 className="text-sm font-bold text-white uppercase tracking-wider mb-4">خدمة العملاء</h4>
            <ul className="space-y-2.5 text-xs text-neutral-400">
              <li>
                <button
                  onClick={() => {
                    onNavigate('content', { pageId: 'faq' });
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="hover:text-white transition-colors"
                >
                  الأسئلة المتكررة
                </button>
              </li>
              <li>
                <button
                  onClick={() => {
                    onNavigate('content', { pageId: 'about' });
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="hover:text-white transition-colors"
                >
                  عن البراند والفلسفة
                </button>
              </li>
            </ul>
          </div>

          {/* Contact Info */}
          <div>
            <h4 className="text-sm font-bold text-white uppercase tracking-wider mb-4">تواصل معنا</h4>
            <ul className="space-y-3 text-xs text-neutral-400">
              {settings.whatsappNumber && (
                <li className="flex items-start gap-2.5">
                  <span className="text-emerald-400 font-semibold shrink-0">WhatsApp:</span>
                  <a
                    href={`https://wa.me/${settings.whatsappNumber.replace(/[^0-9]/g, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-white text-neutral-300 font-mono"
                    dir="ltr"
                  >
                    {settings.whatsappNumber}
                  </a>
                </li>
              )}
              {settings.phone && (
                <li className="flex items-center gap-2.5">
                  <Phone className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                  <a href={`tel:${settings.phone}`} className="hover:text-white font-mono" dir="ltr">
                    {settings.phone}
                  </a>
                </li>
              )}
              {settings.email && (
                <li className="flex items-center gap-2.5">
                  <Mail className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                  <a href={`mailto:${settings.email}`} className="hover:text-white">
                    {settings.email}
                  </a>
                </li>
              )}
              {settings.address && (
                <li className="flex items-start gap-2.5">
                  <MapPin className="w-3.5 h-3.5 text-neutral-500 shrink-0 mt-0.5" />
                  <span>{settings.address}</span>
                </li>
              )}
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-16 pt-8 border-t border-neutral-900 flex flex-col sm:flex-row items-center justify-between text-xs text-neutral-500 gap-4">
          <p>© {currentYear} AMADAL. جميع الحقوق محفوظة. علامة تجارية مسجلة.</p>
          <div className="flex items-center gap-6">
            <span className="text-neutral-400 font-mono text-[11px]">ALGERIA // CONTEMPORARY WEAR</span>
            <button
              onClick={() => onNavigate('admin')}
              className="text-neutral-600 hover:text-neutral-400 transition-colors"
            >
              بوابة الإدارة
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
};
