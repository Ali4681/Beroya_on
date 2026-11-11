import { fillName, hasNamePlaceholder, personalizeCopy } from './personalize';

describe('personalizeCopy', () => {
  it('replaces {name} tokens', () => {
    expect(fillName('مرحباً {name}', 'علي')).toBe('مرحباً علي');
    expect(hasNamePlaceholder('يا {الاسم}')).toBe(true);
    expect(
      personalizeCopy('عيد ميلاد سعيد', 'كل عام وأنت بخير يا {name}!', 'سارة'),
    ).toEqual({
      title: 'عيد ميلاد سعيد',
      body: 'كل عام وأنت بخير يا سارة!',
    });
  });

  it('prefixes the name when no token is present', () => {
    expect(personalizeCopy('عيد ميلاد سعيد', 'كل عام وأنت بخير!', 'أحمد')).toEqual({
      title: 'عيد ميلاد سعيد',
      body: 'أحمد، كل عام وأنت بخير!',
    });
  });

  it('falls back when the name is missing', () => {
    expect(personalizeCopy('ت', 'نص {name}', null).body).toBe('نص عزيزي');
  });
});
