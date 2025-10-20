import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { searchOutline, personOutline, personCircleOutline, logOutOutline, locationOutline, informationCircleOutline, mailOutline, logoWhatsapp, logoFacebook, logoInstagram } from 'ionicons/icons';

import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';
import { authInterceptor } from './app/core/auth.interceptor';

addIcons({
  'search-outline': searchOutline,
  'person-outline': personOutline,
  'person-circle-outline': personCircleOutline,
  'location-outline': locationOutline,
  'information-circle-outline': informationCircleOutline,
  'mail-outline': mailOutline,
  'log-out-outline': logOutOutline,
  'logo-whatsapp': logoWhatsapp,
  'logo-facebook': logoFacebook,
  'logo-instagram': logoInstagram,
});

bootstrapApplication(AppComponent, {
  providers: [
    provideIonicAngular(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
  ],
});
