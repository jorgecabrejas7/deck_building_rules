// Account pages (F1): sign-in, sign-up, profile, privacy, and the legal footer shared with the app.
const FAN = 'La guía del Yoryi is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.';

// t is T() of the current language; the privacy link is relative so it works from app/ and app/account.html alike.
export const legalHtml = (t) => '<p>' + FAN + '</p>' + (t.fanTr ? '<p>' + t.fanTr + '</p>' : '')
  + '<p>' + t.credit + ' · <a href="account.html?view=privacy">' + t.privacyLink + '</a></p>';

export default {
es: {
acctBtn:'Cuenta',acctTag:'Cuenta',backApp:'Volver a la guía',
fanTr:'La guía del Yoryi es Contenido de Fans no oficial permitido bajo la Política de Contenido de Fans. No está aprobado ni respaldado por Wizards. Parte del material utilizado es propiedad de Wizards of the Coast. ©Wizards of the Coast LLC.',
credit:'Datos e imágenes de cartas: Scryfall · Combos: Commander Spellbook',privacyLink:'Privacidad',
signIn:'Entrar',signInT:'Entrar en tu cuenta',signUp:'Crear cuenta',signUpT:'Crear una cuenta',
username:'Usuario',email:'Correo (opcional)',password:'Contraseña',passwordAgain:'Repite la contraseña',
google:'Continuar con Google',or:'o',noAccount:'¿No tienes cuenta?',haveAccount:'¿Ya tienes cuenta?',
wrongCreds:'Usuario o contraseña incorrectos.',pwMismatch:'Las contraseñas no coinciden.',
errGoogle:'No se pudo entrar, o tu cuenta está esperando aprobación.',
errNet:'No se pudo contactar con el servidor. Inténtalo de nuevo en un momento.',
pendingT:'Cuenta pendiente de aprobación',pendingX:'Tu cuenta está creada. Te dejaremos entrar cuando la aprobemos. Vuelve a entrar más tarde.',
profileT:'Tu cuenta',displayName:'Nombre para mostrar',language:'Idioma',save:'Guardar',saved:'Guardado.',
changePw:'Cambiar contraseña',currentPw:'Contraseña actual',newPw:'Contraseña nueva',pwChanged:'Contraseña cambiada.',
signOut:'Salir',delT:'Borrar la cuenta',delX:'Se borra tu cuenta y sus datos. No se puede deshacer. Los mazos guardados en este navegador no se tocan.',
delNeedsPw:'Si entraste con Google, crea primero una contraseña arriba.',delGo:'Borrar mi cuenta…',
delConfirm:'Sí, borrar mi cuenta',delCancel:'Cancelar',delWrongPw:'Contraseña incorrecta.',
privT:'Privacidad',
priv:[
['Qué datos guardamos','Tu usuario, tu correo si lo das, tu nombre para mostrar, tu idioma y una huella de tu contraseña (nunca la contraseña). Una cookie de sesión te mantiene dentro. Es estrictamente necesaria. No usamos cookies de seguimiento ni analítica.'],
['Para qué','Para que puedas entrar y para que aprobemos las cuentas nuevas.'],
['Base legal','Ejecución del servicio que pides (RGPD, art. 6.1.b).'],
['Cuánto tiempo','Hasta que borres tu cuenta. Las copias de seguridad se guardan 14 días.'],
['Quién lo trata','Contabo, el alojamiento, en Alemania. Google, solo si entras con Google.'],
['Tus derechos','Acceder a tus datos, corregirlos y borrarlos. Puedes borrar tu cuenta tú mismo desde tu perfil. Si crees que algo va mal, puedes reclamar ante la AEPD.'],
['Contacto','']],
},
en: {
acctBtn:'Account',acctTag:'Account',backApp:'Back to the guide',
fanTr:'',
credit:'Card data and images: Scryfall · Combos: Commander Spellbook',privacyLink:'Privacy',
signIn:'Sign in',signInT:'Sign in to your account',signUp:'Create account',signUpT:'Create an account',
username:'Username',email:'Email (optional)',password:'Password',passwordAgain:'Repeat the password',
google:'Continue with Google',or:'or',noAccount:'No account yet?',haveAccount:'Already have an account?',
wrongCreds:'Wrong username or password.',pwMismatch:'The passwords do not match.',
errGoogle:'Could not sign in, or your account is waiting for approval.',
errNet:'Could not reach the server. Try again in a moment.',
pendingT:'Account waiting for approval',pendingX:'Your account is created. We will let you in once we approve it. Sign in again later.',
profileT:'Your account',displayName:'Display name',language:'Language',save:'Save',saved:'Saved.',
changePw:'Change password',currentPw:'Current password',newPw:'New password',pwChanged:'Password changed.',
signOut:'Sign out',delT:'Delete the account',delX:'Your account and its data are deleted. This cannot be undone. Decks saved in this browser are not touched.',
delNeedsPw:'If you signed in with Google, set a password above first.',delGo:'Delete my account…',
delConfirm:'Yes, delete my account',delCancel:'Cancel',delWrongPw:'Wrong password.',
privT:'Privacy',
priv:[
['What we store','Your username, your email if you give one, your display name, your language and a hash of your password (never the password). A session cookie keeps you signed in. It is strictly necessary. We use no tracking or analytics cookies.'],
['Why','So you can sign in and so we can approve new accounts.'],
['Legal basis','Performing the service you ask for (GDPR, art. 6.1.b).'],
['How long','Until you delete your account. Backups are kept 14 days.'],
['Who processes it','Contabo, the hosting, in Germany. Google, only if you sign in with Google.'],
['Your rights','Access your data, correct it and erase it. You can delete your account yourself from your profile. If you think something is wrong, you can complain to the AEPD.'],
['Contact','']],
}};
