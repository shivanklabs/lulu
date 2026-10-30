import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { InfoMessage } from '../../components/ui/Feedback';
import { LinkButton } from '../../components/ui/Button';
import { AuthCard } from './AuthCard';

// The backend has no password-reset endpoint or email service, so no reset form is offered.
// This page states that plainly instead of pretending to send a reset email.
export const ForgotPasswordPage = () => {
  useDocumentTitle('Forgot password');
  return (
    <AuthCard
      title="Forgot your password?"
      footer={
        <>
          Remembered it? <Link to="/login">Back to sign in</Link>
        </>
      }
    >
      <InfoMessage title="Password reset is not available online yet">
        MediBridge cannot send password-reset emails at the moment, and passwords cannot be reset from any dashboard.
      </InfoMessage>
      <div className="stack">
        <div>
          <h2 className="card-title">Doctors</h2>
          <p className="muted">
            Contact your hospital administrator. If you have not activated your account yet, they can send you a new
            invitation link.
          </p>
        </div>
        <div>
          <h2 className="card-title">Patients</h2>
          <p className="muted">Contact the hospital where you booked your appointment for help with your account.</p>
        </div>
        <LinkButton to="/contact" variant="secondary" block>
          Contact details
        </LinkButton>
      </div>
    </AuthCard>
  );
};
