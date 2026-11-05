"""Credenciais Cloudflare simuladas; nenhuma chamada à API real."""
import importlib.util
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('credentials',ROOT/'scripts/ci/check_worker_credentials.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class CredentialsTests(unittest.TestCase):
    def request(self,url,token):
        if url.endswith('/verify'):return {'success':True,'result':{'status':'active'}}
        return {'success':True,'result':[{'id':'tenkiter-og'},{'id':'outro-projeto'}]}
    def test_account_token_are_sufficient_without_dns_zone(self):
        result=m.validate('token-simulado','conta-simulada',self.request)
        self.assertTrue(result['tokenAtivo'])
        self.assertEqual(result['workersEsperadosEncontrados'],['tenkiter-og'])
        self.assertNotIn('outro-projeto',str(result))
    def test_missing_credentials_fail_before_api(self):
        for token,account in [('', 'conta'),('token','')]:
            with self.assertRaises(ValueError):m.validate(token,account,lambda *args:self.fail('não chamar API'))
    def test_http200_with_api_error_is_not_accepted(self):
        with self.assertRaises(ValueError):m.validate('token','conta',lambda *args:{'success':False,'result':{'status':'active'}})
    def test_inactive_token_is_not_accepted(self):
        with self.assertRaises(ValueError):m.validate('token','conta',lambda *args:{'success':True,'result':{'status':'disabled'}})
    def test_worker_permission_denial_is_not_accepted(self):
        def get(url,token):return self.request(url,token) if url.endswith('/verify') else {'success':False,'result':[]}
        with self.assertRaises(ValueError):m.validate('token','conta',get)
    def test_empty_account_can_publish_first_worker(self):
        def get(url,token):return self.request(url,token) if url.endswith('/verify') else {'success':True,'result':[]}
        self.assertTrue(m.validate('token','conta',get)['leituraWorkersConfirmada'])

if __name__=='__main__':unittest.main()
