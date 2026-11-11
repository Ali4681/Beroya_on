import { PassportService } from './passport.service';

describe('PassportService.toCustomerView', () => {
  const service = Object.create(PassportService.prototype) as PassportService;

  const level = {
    id: 'level-1',
    name_ar: 'ذهبي',
    name_en: 'Gold',
    stamp_name_ar: 'أنت استثنائي',
    stamp_name_en: 'You are exceptional',
    level_order: 3,
    icon_storage_key: 'passport/customer/level-1.png',
  };

  const stamps = {
    count: 3,
    latest: {
      name: 'أنت استثنائي',
      name_en: 'You are exceptional',
      image_url: '/api/v1/go/customer/passport/levels/level-3/icon',
      earned_at: '2026-10-14T00:00:00.000Z',
      expires_at: null,
    },
    items: [
      {
        name: 'بداية موفقة',
        name_en: 'Good start',
        image_url: '/api/v1/go/customer/passport/levels/level-1/icon',
        earned_at: '2026-10-01T00:00:00.000Z',
        expires_at: null,
      },
      {
        name: 'خطوة ثابتة',
        name_en: 'Steady step',
        image_url: '/api/v1/go/customer/passport/levels/level-2/icon',
        earned_at: '2026-10-07T00:00:00.000Z',
        expires_at: null,
      },
      {
        name: 'أنت استثنائي',
        name_en: 'You are exceptional',
        image_url: '/api/v1/go/customer/passport/levels/level-3/icon',
        earned_at: '2026-10-14T00:00:00.000Z',
        expires_at: null,
      },
    ],
  };

  it('matches the GET /customer/passport shape and omits scores', () => {
    const activeReward = {
      label: 'خصم 15%',
      percentage: 15,
      discount_code_id: 'disc-1',
      code: 'MS-ABC',
      expires_at: '2026-11-01T00:00:00.000Z',
    };
    const view = service.toCustomerView(level, 4, stamps, activeReward);
    expect(view).toEqual({
      level: {
        id: 'level-1',
        name: 'ذهبي',
        name_en: 'Gold',
        stamp_name_ar: 'أنت استثنائي',
        stamp_name_en: 'You are exceptional',
        order: 3,
        icon_url: expect.stringContaining('level-1'),
      },
      current_streak: 4,
      stamps,
      active_reward: activeReward,
    });
    expect(JSON.stringify(view)).not.toMatch(/hidden_score|"score"|points|minimum_/);
  });

  it('allows empty stamps and null active_reward', () => {
    const view = service.toCustomerView(level, 0, { count: 0, latest: null, items: [] }, null);
    expect(view.stamps).toEqual({ count: 0, latest: null, items: [] });
    expect(view.active_reward).toBeNull();
  });

  it('passes through full stamps.items for the notebook', () => {
    const view = service.toCustomerView(level, 1, stamps, null);
    expect(view.stamps.count).toBe(3);
    expect(view.stamps.items).toHaveLength(3);
    expect(view.stamps.latest).toEqual(view.stamps.items[2]);
  });
});
